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

  getNextRound(roomCode: string, playerId: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/room/${roomCode}/round/next/${playerId}`);
  }

  submitRoundResult(roomCode: string, roundNumber: number, playerId: number, mistakes: number, timeSeconds: number, points: number): Observable<any> {
    return this.http.post(`${this.baseUrl}/room/${roomCode}/round/${roundNumber}/submit-result`, { playerId, mistakes, timeSeconds, points });
  }

  getLeaderboard(roomCode: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.baseUrl}/room/${roomCode}/leaderboard`);
  }
}

