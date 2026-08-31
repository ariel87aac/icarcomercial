import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { SessionUser } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  readonly user = signal<SessionUser | null>(null);
  readonly checking = signal(true);
  readonly authenticated = computed(() => this.user() !== null);

  restore(): void {
    this.http.get<{ user: SessionUser }>('/api/auth/me').subscribe({
      next: ({ user }) => {
        this.user.set(user);
        this.checking.set(false);
      },
      error: () => {
        this.user.set(null);
        this.checking.set(false);
      },
    });
  }

  login(identifier: string, password: string): Observable<{ user: SessionUser }> {
    return this.http
      .post<{ user: SessionUser }>('/api/auth/login', { identifier, password })
      .pipe(tap(({ user }) => this.user.set(user)));
  }

  logout(): Observable<{ message: string }> {
    return this.http
      .post<{ message: string }>('/api/auth/logout', {})
      .pipe(tap(() => this.user.set(null)));
  }

  clear(): void {
    this.user.set(null);
  }

  can(permission: string): boolean {
    return this.user()?.permissions.includes(permission) ?? false;
  }
}

