import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UsageService } from '../../users/usage.service';

@Injectable()
export class EnergyGuard implements CanActivate {
  constructor(private usageService: UsageService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub || request.user?._id;

    if (!userId) {
      return true; // Use other guards (like JwtAuthGuard) to handle authentication validation
    }

    const canProceed = await this.usageService.checkEnergyAvailability(userId);

    if (!canProceed) {
      throw new ForbiddenException(
        'Daily energy limit exceeded. Please upgrade your plan or wait until tomorrow.',
      );
    }

    return true;
  }
}
