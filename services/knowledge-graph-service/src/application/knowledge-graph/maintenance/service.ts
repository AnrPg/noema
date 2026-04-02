import type {
  ICkgMaintenanceApplicationService,
  ICkgResetInput,
  ICkgResetPort,
  ICkgResetResult,
} from './contracts.js';

export class CkgMaintenanceApplicationService implements ICkgMaintenanceApplicationService {
  constructor(private readonly resetPort: ICkgResetPort) {}

  async resetCkg(input?: ICkgResetInput): Promise<ICkgResetResult> {
    return this.resetPort.reset(input);
  }
}
