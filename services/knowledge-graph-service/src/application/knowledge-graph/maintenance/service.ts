import type {
  ICkgMaintenanceApplicationService,
  ICkgMaintenancePort,
  ICkgResetInput,
  ICkgResetResult,
  ICkgSourcePurgeInput,
  ICkgSourcePurgeResult,
} from './contracts.js';

export class CkgMaintenanceApplicationService implements ICkgMaintenanceApplicationService {
  constructor(private readonly maintenancePort: ICkgMaintenancePort) {}

  async resetCkg(input?: ICkgResetInput): Promise<ICkgResetResult> {
    return this.maintenancePort.reset(input);
  }

  async purgeCkgBySource(input: ICkgSourcePurgeInput): Promise<ICkgSourcePurgeResult> {
    return this.maintenancePort.purgeBySource(input);
  }
}
