import { Injectable } from '@angular/core';
import { io, Socket } from "socket.io-client";

@Injectable({ providedIn: 'root' })
export class SocketService {

  socket: Socket;

  constructor() {
    this.socket = io("http://localhost:3000"); // Update if deployed
  }

  joinRoom(roomCode: string, playerId: number, playerName: string) {
    this.socket.emit("joinRoom", { roomCode, playerId, playerName });
  }

  sendScore(roomCode: string, playerId: number, score: number) {
    this.socket.emit("updateScore", { roomCode, playerId, score });
  }

  onLeaderboardUpdate(callback: (players: any[]) => void) {
    this.socket.on("leaderboardUpdate", callback);
  }
}
