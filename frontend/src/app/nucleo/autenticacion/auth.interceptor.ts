import { HttpBackend, HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, finalize, shareReplay, switchMap, throwError } from 'rxjs';

let refreshRequest: Observable<unknown> | null = null;

function isAuthenticationRequest(request: HttpRequest<unknown>): boolean {
  return request.url.includes('/api/auth/login') ||
    request.url.includes('/api/auth/logout') ||
    request.url.includes('/api/auth/refresh') ||
    request.url.includes('/api/auth/recovery');
}

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (isAuthenticationRequest(request)) return next(request);
  const rawHttp = new HttpClient(inject(HttpBackend));
  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401) return throwError(() => error);
      refreshRequest ??= rawHttp.post('/api/auth/refresh', {}).pipe(
        finalize(() => { refreshRequest = null; }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      return refreshRequest.pipe(switchMap(() => next(request)));
    }),
  );
};
