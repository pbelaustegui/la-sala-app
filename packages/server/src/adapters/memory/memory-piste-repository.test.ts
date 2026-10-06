import { describePisteRepositoryContract } from '../../application/piste-repository.contract';
import { MemoryPisteRepository } from './memory-piste-repository';

describePisteRepositoryContract('memory', () => new MemoryPisteRepository());
