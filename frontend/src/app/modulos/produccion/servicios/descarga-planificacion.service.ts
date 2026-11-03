import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export type PlanningPdfMode = 'TOTAL' | 'AREAS';

@Injectable({ providedIn: 'root' })
export class DescargaPlanificacionService {
  private readonly http = inject(HttpClient);

  descargar(orderId: string, mode: PlanningPdfMode): Observable<void> {
    const params = new HttpParams().set('mode', mode).set('orderId', orderId);
    return this.http
      .get('/api/production-reports/planning/export', { params, observe: 'response', responseType: 'blob' })
      .pipe(map((response) => this.guardar(response, mode)));
  }

  private guardar(response: HttpResponse<Blob>, mode: PlanningPdfMode): void {
    const disposition = response.headers.get('content-disposition') ?? '';
    const matchedName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    const fallback = `icar-planificacion-${mode === 'TOTAL' ? 'total-productos' : 'ordenes-por-area'}.pdf`;
    const url = URL.createObjectURL(response.body ?? new Blob([], { type: 'application/pdf' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = matchedName ?? fallback;
    link.click();
    URL.revokeObjectURL(url);
  }
}
