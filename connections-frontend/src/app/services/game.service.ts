import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class GameService {

  private baseUrl = 'http://127.0.0.1:3000';

  constructor(private http: HttpClient) { }

  joinRoom(roomCode: string, playerName: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/join-room`, { roomCode, playerName });
  }

  getPuzzle(roomCode: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/room/${roomCode}`);
  }

  submitResult(playerId: number, mistakes: number, timeSeconds: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/submit-result`, { playerId, mistakes, timeSeconds });
  }

  getWinner(roomCode: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/room/${roomCode}/winner`);
  }
}

