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
  maxMistakes = 4;
  groupPoints = 20;
  mistakePenalty = 10;
  speedDivider = 2; // smaller = bigger bonus
  maxTime = 300; // 5 mins
  finalScore = 0;
  puzzleCompleted = false;
  leaderboardPlayers: any[] = [];

  selectedWords: string[] = [];
  completedGroups: { name: string; words: string[]; connection: string }[] = [];
  shakingWords: string[] = [];

  groupColors: { [key: string]: string } = {
    Yellow: '#f9df6d',
    Green: '#a0c35a',
    Blue: '#b0c4ef',
    Purple: '#b68abfff'
  };

  constructor(private gameService: GameService, private socketService: SocketService) { }

  ngOnInit() {
    if (this.isDev) {
      this.roomCode = "HYE7N9";
      this.playerName = "DevTesterAdmin";
      setTimeout(() => this.joinRoom(), 100);
    }
    this.socketService.onLeaderboardUpdate(players => {
      this.leaderboardPlayers = players;
    });
  }

  joinRoom() {
    this.gameService.joinRoom(this.roomCode, this.playerName).subscribe(res => {
      this.playerId = res.playerId;

      this.gameService.getLatestRound(this.roomCode).subscribe(round => {
        this.puzzle = round.puzzle;
        this.roundId = round.id;

        this.words = this.puzzle.groups
          .map((g: any) => g.words)
          .flat();

        this.words = this.shuffleArray(this.words);

        this.startTimer();
      });


    }, err => {
      Swal.fire('Error', err.error?.error || 'Failed to join room', 'error');
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

  // Submit the selected words as a guess
  submitSelection() {
    if (this.selectedWords.length !== 4) return;

    const matchingGroup = this.puzzle.groups.find((group: any) =>
      this.selectedWords.every(w => group.words.includes(w))
    );

    if (matchingGroup) {
      console.log("Correct group:", matchingGroup.name, this.selectedWords);

      // Remove words from main row
      this.words = this.words.filter(w => !this.selectedWords.includes(w));

      // Add to completed groups
      this.completedGroups.push({
        name: matchingGroup.name,
        words: this.selectedWords.slice(),
        connection: matchingGroup.connection
      });

      this.selectedWords = [];

        if (this.completedGroups.length === 4 && !this.puzzleCompleted) {
    this.onPuzzleCompleted();
  }
    } else {
      console.log("Wrong set:", this.selectedWords);
      this.mistakes++;
        if (this.mistakes >= this.maxMistakes) {
          this.mistakes = this.maxMistakes;
          this.onPuzzleCompleted();
          return;
        }

      this.shakingWords = [...this.selectedWords];
      setTimeout(() => {
        this.shakingWords = [];
      }, 500);

      this.selectedWords = [];
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

  onPuzzleCompleted() {
    if (this.puzzleCompleted) return;
    this.puzzleCompleted = true;

    this.stopTimer();

    this.finalScore = this.calculateScore();

    this.gameService.submitRoundResult(
      this.roomCode,
      this.roundId,
      this.playerId,
      this.mistakes,
      this.timeSeconds,
      this.finalScore
    ).subscribe({
      next: () => console.log('Result submitted'),
      error: err => console.error('Failed to submit result', err)
    });

    Swal.fire({
      title: "Round Finished",
      html: `
        <b>Correct Groups:</b> ${this.completedGroups.length}/4<br>
        <b>Mistakes:</b> ${this.mistakes}/${this.maxMistakes}<br>
        <b>Time:</b> ${this.timeSeconds}s<br><br>
        <b>Score:</b> ${this.finalScore}
      `,
      icon: "info",
      confirmButtonText: "Start Next Round"
    }).then(() => {
      this.loadNextRound();
    });
  }

  loadNextRound() {
    this.gameService.getLatestRound(this.roomCode).subscribe(round => {
      this.puzzle = round.puzzle;
      this.roundId = round.round_number;
      this.words = this.puzzle.groups.map((g: any) => g.words).flat();
      this.words = this.shuffleArray(this.words);

      // reset stats
      this.timeSeconds = 0;
      this.mistakes = 0;
      this.puzzleCompleted = false;
      this.completedGroups = [];
      this.selectedWords = [];

      this.startTimer();
    });
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

}
