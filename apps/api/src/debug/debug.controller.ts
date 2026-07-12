import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/auth.guards';
import { CurrentUser } from '../common/decorators/auth.decorators';

@ApiTags('debug')
@Controller('debug')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class DebugController {
  @Post('client-log')
  clientLog(
    @Body() body: Record<string, unknown>,
    @CurrentUser('sub') userId: string,
    @CurrentUser('role') role: string,
    @CurrentUser('organizationId') organizationId: string,
  ) {
    // Intentionally logs only small JSON payloads. No images are accepted/stored.
    // Use this for debugging on-device OCR and UI flows.
    console.log(
      'CLIENT_DEBUG',
      JSON.stringify({
        at: new Date().toISOString(),
        userId,
        role,
        organizationId,
        ...body,
      }),
    );
    return { ok: true };
  }
}

