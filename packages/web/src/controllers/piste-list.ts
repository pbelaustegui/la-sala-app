import type { ApiClient, PisteStatus } from '../core/api-client';
import { Observable } from '../core/observable';

export interface PisteListState {
  readonly status: 'loading' | 'ready' | 'offline';
  /** Last pistes loaded; kept while a refresh fails so the judge still sees something. */
  readonly pistes: readonly PisteStatus[];
}

/** Loads the public piste list (`GET /pistes`). */
export class PisteListController extends Observable<PisteListState> {
  constructor(private readonly api: Pick<ApiClient, 'listPistes'>) {
    super({ status: 'loading', pistes: [] });
  }

  async refresh(): Promise<void> {
    const result = await this.api.listPistes();
    const { pistes } = this.get();
    this.set(result.ok ? { status: 'ready', pistes: result.value } : { status: 'offline', pistes });
  }
}
