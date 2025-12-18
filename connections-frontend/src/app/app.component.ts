import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from './services/game.service';
import Swal from 'sweetalert2';
import { HttpClientModule } from '@angular/common/http';
import { SocketService } from './services/socket.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  isDev = true;

  // puzzle
  roomCode: string = '';
  roundId!: number;
  playerName: string = '';
  playerId!: number;
  puzzle: any;
  categories: string[] = [];
  words: string[] = [];

  timeSeconds: number = 0;
  timerInterval: any;
  mistakes: number = 0;
  isShaking = false;

  // game/player stats
  currentRoundNumber!: number;
  maxMistakes = 4;
  groupPoints = 20;
  mistakePenalty = 10;
  speedDivider = 2; // smaller = bigger bonus
  maxTime = 300; // 5 mins
  finalScore = 0;
  puzzleCompleted = false;
  roundFinished = false;
  showNextRoundButton = false;
  leaderboardPlayers: any[] = [];

  // for scoring and animation
  selectedWords: string[] = [];
  completedGroups: { name: string; words: string[]; connection: string }[] = [];
  shakingWords: string[] = [];
  liftingWords: string[] = [];
  flyingWords: string[] = [];
  inputLocked = false;

  groupColors: { [key: string]: string } = {
    Yellow: '#f9df6d',
    Green: '#a0c35a',
    Blue: '#b0c4ef',
    Purple: '#b68abfff'
  };

  constructor(private gameService: GameService, private socketService: SocketService) { }

  ngOnInit() {
    if (this.isDev) {
      this.roomCode = "4X4THI";
      this.playerName = "DevTesterAdmin";
      setTimeout(() => this.joinRoom(), 100);
    }
    this.socketService.onLeaderboardUpdate(players => {
      this.leaderboardPlayers = players;
    });
  }

  // loadRound(round: any) {
  //   this.puzzle = round.puzzle;
  //   this.roundId = round.id; // DB id for submissions
  //   this.currentRoundNumber = round.round_number; // track number separately if needed

  //   this.words = this.puzzle.groups
  //   .map((g: any) => g.words)
  //   .flat();
  //   this.words = this.shuffleArray(this.words);

  //   // Reset stats
  //   this.timeSeconds = 0;
  //   this.mistakes = 0;
  //   this.puzzleCompleted = false;
  //   this.completedGroups = [];
  //   this.selectedWords = [];

  //   this.startTimer();
  // }

  joinRoom() {
    this.gameService.joinRoom(this.roomCode, this.playerName).subscribe({
      next: (res) => {
        this.playerId = res.playerId;
        this.playerName = res.name;
        this.loadNextRound();
      },
      error: (err) => {
        if (err.status === 409) {
          Swal.fire('Name Taken', 'That name is already in use in this room. Please choose another.', 'warning');
        } else {
          Swal.fire('Error', err.error?.error || 'Failed to join room', 'error');
        }
      }
    });
  }

  // Toggle word selection on click
  toggleWordSelection(word: string) {
    if (this.shakingWords.length) return;
    const alreadySelected = this.selectedWords.includes(word);

    if (alreadySelected) {
      // Deselect
      this.selectedWords = this.selectedWords.filter(w => w !== word);
      return;
    }

    if (this.selectedWords.length >= 4) {
      return;
    }
    this.selectedWords.push(word);
  }

  // Submit the selected words as a guess - old without animations on the words and row etc
  // submitSelection() {
  //   if (this.selectedWords.length !== 4) return;

  //   const matchingGroup = this.puzzle.groups.find((group: any) =>
  //     this.selectedWords.every(w => group.words.includes(w))
  //   );

  //   if (matchingGroup) {
  //     console.log("Correct group:", matchingGroup.name, this.selectedWords);

  //     // Remove words from main row
  //     this.words = this.words.filter(w => !this.selectedWords.includes(w));

  //     // Add to completed groups
  //     this.completedGroups.push({
  //       name: matchingGroup.name,
  //       words: this.selectedWords.slice(),
  //       connection: matchingGroup.connection
  //     });

  //     this.selectedWords = [];

  //       if (this.completedGroups.length === 4 && !this.puzzleCompleted) {
  //   this.onPuzzleCompleted();
  // }
  //   } else {
  //     console.log("Wrong set:", this.selectedWords);
  //     this.mistakes++;
  //       if (this.mistakes >= this.maxMistakes) {
  //         this.mistakes = this.maxMistakes;
  //         this.onPuzzleCompleted();
  //         return;
  //       }

  //     this.shakingWords = [...this.selectedWords];
  //     setTimeout(() => {
  //       this.shakingWords = [];
  //     }, 500);

  //     this.selectedWords = [];
  //   }
  // }

  // needed to make animations work
  async submitSelection() {
    if (this.selectedWords.length !== 4 || this.inputLocked) return;

    this.inputLocked = true;

    // Lift animation, one by one
    for (const word of this.selectedWords) {
      this.liftingWords = [word];
      await this.delay(240);
    }

    this.liftingWords = [];
    await this.delay(50);

    await this.checkSelection();
  }

  async checkSelection() {
    const matchingGroup = this.puzzle.groups.find((group: any) =>
      this.selectedWords.every(w => group.words.includes(w))
    );

    if (matchingGroup) {
      // Fly words
      this.flyingWords = [...this.selectedWords];
      await this.delay(400);

      // Remove words from grid
      this.words = this.words.filter(w => !this.selectedWords.includes(w));
      this.flyingWords = [];

      // Add completed row
      this.completedGroups.push({
        name: matchingGroup.name,
        words: [...this.selectedWords],
        connection: matchingGroup.connection
      });

      this.selectedWords = [];
      this.inputLocked = false;

      if (this.completedGroups.length === 4 && !this.puzzleCompleted) {
        this.onPuzzleCompleted();
      }

    } else {
      this.mistakes++;

      if (this.mistakes >= this.maxMistakes) {
        this.mistakes = this.maxMistakes;
        this.inputLocked = false;
        this.onPuzzleCompleted();
        return;
      }

      this.shakingWords = [...this.selectedWords];
      await this.delay(500);

      this.shakingWords = [];
      this.selectedWords = [];
      this.inputLocked = false;
    }
  }

  calculateScore(): number {
    const correctGroups = this.completedGroups.length;
    const base = correctGroups * this.groupPoints;

    const penalty = this.mistakes * this.mistakePenalty;
    const speedBonus = Math.max(0, (this.maxTime - this.timeSeconds) / this.speedDivider);

    let score = base + speedBonus - penalty;

    return Math.max(0, Math.round(score)); // never negative
  }

  // onPuzzleCompleted() {
  //   if (this.puzzleCompleted) return;

  //   this.puzzleCompleted = true;

  //   this.stopTimer();

  //   this.finalScore = this.calculateScore();

  //   this.gameService.submitRoundResult(
  //     this.roomCode,
  //     this.currentRoundNumber,
  //     this.playerId,
  //     this.mistakes,
  //     this.timeSeconds,
  //     this.finalScore
  //   ).subscribe({
  //     next: () => console.log('Result submitted'),
  //     error: err => console.error('Failed to submit result', err)
  //   });

  //   const leader = this.leaderboardPlayers[0];

  //   Swal.fire({
  //     title: "Round Finished",
  //     html: `
  //       <b>Correct Groups:</b> ${this.completedGroups.length}/4<br>
  //       <b>Mistakes:</b> ${this.mistakes}/${this.maxMistakes}<br>
  //       <b>Time:</b> ${this.timeSeconds}s<br><br>
  //       <b>Score:</b> ${this.finalScore}
  //       <b>Current Leader:</b><br>
  //       ${leader ? `${leader.name} — ${leader.score ?? leader.total_points} pts` : 'No leader yet'}
  //     `,
  //     icon: "info",
  //     confirmButtonText: "Okay"
  //   // }).then(() => {
  //   //   this.loadNextRound();
  //   });
  //   this.showNextRoundButton = true;
  // }




  // loadNextRound() {
  //   this.gameService.getLatestRound(this.roomCode).subscribe(round => {
  //     this.puzzle = round.puzzle;
  //     this.roundId = round.round_number;
  //     this.words = this.puzzle.groups.map((g: any) => g.words).flat();
  //     this.words = this.shuffleArray(this.words);

  //     // reset stats
  //     this.timeSeconds = 0;
  //     this.mistakes = 0;
  //     this.puzzleCompleted = false;
  //     this.completedGroups = [];
  //     this.selectedWords = [];

  //     this.startTimer();
  //   });
  // }

  formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2,'0')}:${secs.toString().padStart(2,'0')}`;
}

  onPuzzleCompleted() {
    if (this.puzzleCompleted) return;

    this.puzzleCompleted = true;
    this.stopTimer();
    this.finalScore = this.calculateScore();
    const completedMessage = (this.mistakes < this.maxMistakes) ? "ROUND COMPLETED" : "HARD LUCK";

    // Listen for leaderboard update *before* submitting score
    const handleLeaderboard = (players: any[]) => {
      const leader = players[0];
      // Swal.fire({
      //   title: "Round Finished",
      //   html: `
      //     <b>Correct Groups:</b> ${this.completedGroups.length}/4<br>
      //     <b>Mistakes:</b> ${this.mistakes}/${this.maxMistakes}<br>
      //     <b>Time:</b> ${this.timeSeconds}s<br><br>
      //     <b>Score:</b> ${this.finalScore}<br>
      //     <b>Current Leader:</b><br>
      //     ${leader ? `${leader.name} — ${leader.score ?? leader.total_points} pts` : 'No leader yet'}
      //   `,
      //   icon: "info",
      //   confirmButtonText: "Okay"
      // });

      // Remove listener after first trigger
      this.socketService.socket.off('leaderboardUpdate', handleLeaderboard);
    };

    this.socketService.socket.on('leaderboardUpdate', handleLeaderboard);

    // Submit score
    this.gameService.submitRoundResult(
      this.roomCode,
      this.currentRoundNumber,
      this.playerId,
      this.mistakes,
      this.timeSeconds,
      this.finalScore
    ).subscribe({
      next: () => {
        // Get latest leaderboard after score submission
        this.gameService.getLeaderboard(this.roomCode).subscribe(players => {
          const leader = players[0];
          Swal.fire({
            title: completedMessage,
            html: `
              <hr>

              <div class="stats-section">
                <div class="stat">
                  <div>${this.currentRoundNumber}</div>
                  <p>Completed</p>
                </div>

                <div class="stat">
                  <div>${this.formatTime(this.timeSeconds)}</div>
                  <p>Time Taken</p>
                </div>

                <div class="stat">
                  <div>${this.mistakes}</div>
                  <p>Mistakes</p>
                </div>

                <div class="stat">
                  <div>${this.finalScore}</div>
                  <p>Score</p>
                </div>

              </div>

              <hr>

              <div class="leaderboard">
                <h6>Current Leader</h6>
                <p>${leader ? `${leader.name}` : 'No leader yet'}</p>
              </div>

            `
            ,
              imageUrl: 'assets/images/star.png',
              imageWidth: 75,
              imageHeight: 75,
              imageAlt: 'star',
            confirmButtonText: "OKAY",
              customClass: {
                image: 'completed-star'
              }
          });
        });
      },
      error: err => console.error('Failed to submit result', err)
    });


    this.showNextRoundButton = true;
  }


  goToNextRound() {
    this.showNextRoundButton = false;
    this.loadNextRound();
  }

  loadNextRound() {
    this.gameService.getNextRound(this.roomCode, this.playerId)
      .subscribe({
        next: (round) => {
          if (!round) {
            Swal.fire('Game Over', 'You have completed all rounds!', 'info');
            return;
          }

          // set puzzle and stats
          this.puzzle = round.puzzle;
          this.roundId = round.id;
          this.currentRoundNumber = round.round_number;

          this.words = this.puzzle.groups
            .map((g: any) => g.words)
            .flat();
          this.words = this.shuffleArray(this.words);

          // Reset stats
          this.timeSeconds = 0;
          this.mistakes = 0;
          this.puzzleCompleted = false;
          this.completedGroups = [];
          this.selectedWords = [];

          this.startTimer();
        },
        error: (err) => {
          Swal.fire('Error', 'Failed to load next round', 'error');
        }
      });
  }

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  makeMistake() {
    if (this.mistakes < this.maxMistakes) {
      this.mistakes++;
    }
  }

  shuffleArray(array: any[]) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  shuffleWords() {
    this.words = this.shuffleArray(this.words);
  }

  deselectAll() {
    this.selectedWords = [];
  }

  startTimer() {
    this.timeSeconds = 0;
    this.timerInterval = setInterval(() => {
      this.timeSeconds++;
    }, 1000);
  }

  stopTimer() {
    clearInterval(this.timerInterval);
  }

  triggerShake() {
    this.isShaking = true;
    setTimeout(() => {
      this.isShaking = false;
    }, 500);
  }

  delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}
