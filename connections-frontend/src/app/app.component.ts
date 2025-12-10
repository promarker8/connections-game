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
  roomCode: string = '';
  playerName: string = '';
  playerId!: number;
  puzzle: any;
  categories: string[] = [];
  words: string[] = [];

  timeSeconds: number = 0;
  timerInterval: any;
  mistakes: number = 0;

  // NEW: selected words instead of drag-and-drop
  selectedWords: string[] = [];

  constructor(private gameService: GameService) { }

  ngOnInit() { }

  // Toggle word selection on click
  toggleWordSelection(word: string) {
    if (this.selectedWords.includes(word)) {
      // Deselect
      this.selectedWords = this.selectedWords.filter(w => w !== word);
    } else {
      if (this.selectedWords.length < 4) {
        this.selectedWords.push(word);
      }
    }
  }

  // Submit the selected words as a guess
  submitSelection() {
    if (this.selectedWords.length !== 4) {
      Swal.fire('Oops', 'Select exactly 4 words!', 'warning');
      return;
    }

    // Check if all selected words belong to the same category
    const selectedCategories = this.selectedWords.map(w => this.puzzle.connectionMapping[w]);
    const uniqueCategories = Array.from(new Set(selectedCategories));

    if (uniqueCategories.length === 1) {
      // Correct selection
      const correctCategory = uniqueCategories[0];

      // Remove selected words from the remaining words
      this.words = this.words.filter(w => !this.selectedWords.includes(w));

      Swal.fire('Correct!', `You found all 4 words for "${correctCategory}"!`, 'success');

      // Reset selection
      this.selectedWords = [];
    } else {
      // Wrong selection → count as mistake
      this.mistakes++;
      Swal.fire('Wrong!', 'Those words do not belong to the same category.', 'error');

      // Reset selection
      this.selectedWords = [];
    }
  }

  joinRoom() {
    this.gameService.joinRoom(this.roomCode, this.playerName).subscribe(res => {
      this.playerId = res.playerId;

      this.gameService.getPuzzle(this.roomCode).subscribe(puzzleRes => {
        this.puzzle = puzzleRes;
        this.categories = this.puzzle.categories;
        this.words = this.puzzle.words;

        this.startTimer();
      });

    }, err => {
      Swal.fire('Error', err.error?.error || 'Failed to join room', 'error');
    });
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
}
