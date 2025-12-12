import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService } from './services/game.service';
import Swal from 'sweetalert2';
import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  isDev = true;

  roomCode: string = '';
  playerName: string = '';
  playerId!: number;
  puzzle: any;
  categories: string[] = [];
  words: string[] = [];

  timeSeconds: number = 0;
  timerInterval: any;
  mistakes: number = 0;
  isShaking = false;

  selectedWords: string[] = [];
  completedGroups: { name: string; words: string[]; connection: string }[] = [];
  shakingWords: string[] = [];

  groupColors: { [key: string]: string } = {
    Yellow: '#f9df6d',
    Green: '#a0c35a',
    Blue: '#b0c4ef',
    Purple: '#b68abfff'
  };

  constructor(private gameService: GameService) { }

  ngOnInit() {
    if (this.isDev) {
      this.roomCode = "YBE4I5";
      this.playerName = "DevTester";
      setTimeout(() => this.joinRoom(), 100);
    }
  }

  // Toggle word selection on click
  toggleWordSelection(word: string) {
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
    } else {
      console.log("Wrong set:", this.selectedWords);
      this.mistakes++;

      this.shakingWords = [...this.selectedWords];
      setTimeout(() => {
        this.shakingWords = [];
      }, 500);

      this.selectedWords = [];
    }
  }

  joinRoom() {
    this.gameService.joinRoom(this.roomCode, this.playerName).subscribe(res => {
      this.playerId = res.playerId;

      this.gameService.getPuzzle(this.roomCode).subscribe(puzzleRes => {
        this.puzzle = puzzleRes.puzzle;

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
