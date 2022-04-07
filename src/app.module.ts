import {Module} from '@nestjs/common';
import {AppController} from './app.controller';
import {AppService} from './app.service';
import {GitModule} from './git/git.module';
import {ConfigModule} from '@nestjs/config';
import {ScheduleModule} from '@nestjs/schedule';

@Module({
  imports: [ConfigModule.forRoot(), ScheduleModule.forRoot(), GitModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {
}
