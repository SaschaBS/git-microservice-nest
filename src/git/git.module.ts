import {Module} from '@nestjs/common';
import {GitService} from './git.service';

@Module({
  providers: [GitService]
})
export class GitModule {
}
