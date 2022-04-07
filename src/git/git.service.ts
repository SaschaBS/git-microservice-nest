import {Injectable, Logger, OnApplicationBootstrap} from '@nestjs/common';
import {catchError, EMPTY, filter, from, map, merge, Subject, switchMap, tap,} from 'rxjs';
import {emptyDirSync} from 'fs-extra';
import simpleGit, {SimpleGit, SimpleGitProgressEvent} from 'simple-git';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {CronExpression, SchedulerRegistry} from '@nestjs/schedule';
import {CronJob} from 'cron';

@Injectable()
export class GitService implements OnApplicationBootstrap {
  private git: SimpleGit;
  private gitProgress = new Subject<SimpleGitProgressEvent>();

  private readonly logger = new Logger(GitService.name);

  private readonly masterBaseDir: string;
  private readonly localRepoPath: string;
  private readonly remote: string;

  constructor(private schedulerRegistry: SchedulerRegistry) {
    this.git = simpleGit({
      progress: (event: SimpleGitProgressEvent) => this.gitProgress.next(event),
    });

    this.localRepoPath = process.env.LOCAL_REPO_PATH;

    const user = process.env.GIT_USER;
    const pass = process.env.GIT_PASSWORD;
    const remoteRepoPath = process.env.REMOTE_REPO_PATH;

    assert(user, 'environment variable GIT_USER not set');
    assert(pass, 'environment variable GIT_PASSWORD not set');
    assert(this.localRepoPath, 'environment variable LOCAL_REPO_PATH not set');
    assert(remoteRepoPath, 'environment variable REMOTE_REPO_PATH not set');

    this.remote = this.getBasicAuthUrl(remoteRepoPath, user, pass);
    this.masterBaseDir = path.join(this.localRepoPath, 'master');
  }

  initLocalRepo = () => {
    const isRepo = from(
        this.git.cwd({path: this.masterBaseDir}).checkIsRepo(),
    );

    const newRepo = isRepo.pipe(
        filter((result) => !result),
        switchMap(() => {
          this.logger.debug('dir exists, but is not a repo. deleting any files!');
          emptyDirSync(this.masterBaseDir);
          return this.git.clone(this.remote, this.masterBaseDir);
        }),
        catchError((err) => {
          this.logger.debug('error while cloning' + err.message);
          return EMPTY;
        }),
    );

    const existingRepo = isRepo.pipe(
        filter((result) => result),
        tap(() => {
          this.logger.debug('current dir is already git repo');
        }),
    );

    return merge(newRepo, existingRepo).pipe(
        catchError((error: any) => {
          this.logger.error('could not clone repository', error.message);
          return EMPTY;
        }),
    );
  };

  createWatchBranchCronJob(localPath: string, branchName: string) {
    return () => {
      this.logger.debug(
          'getting changes from ' + branchName + ' on local path ' + localPath,
      );
      from(
          this.git
              .cwd(localPath)
              .fetch()
              .diffSummary([branchName, `origin/${branchName}`]),
      )
          .pipe(
              map(({changed, deletions, insertions}) => {
                let changesCount = changed + deletions + insertions;
                changesCount > 0 &&
                this.logger.debug(
                    ` changed: ${changed} deletions: ${deletions} insertions: ${insertions}`,
                );
                return changesCount;
              }),
              filter((changes) => changes > 0),
              switchMap((changes) => {
                this.logger.log(`found ${changes} changes. Pulling...`);
                return this.git.pull();
              }),
              catchError((error) => {
                this.logger.error('could not diff ' + error.message);
                return EMPTY;
              }),
          )
          .subscribe(() => {
            this.logger.debug('up to date');
          });
    };
  }

  startWatching(localPath: string, branchName: string) {
    let job = new CronJob(
        CronExpression.EVERY_10_SECONDS,
        this.createWatchBranchCronJob(localPath, branchName),
    );
    this.schedulerRegistry.addCronJob('watch-branch' + '-' + branchName, job);
    job.start();
  }

  onApplicationBootstrap(): any {
    this.createIfNotExist(this.localRepoPath);
    this.createIfNotExist(this.masterBaseDir);
    this.initLocalRepo().subscribe(() => {
      this.startWatching(this.masterBaseDir, 'main');
      this.logger.log('successful init of local repo');
    });
  }

  getBasicAuthUrl(repo: string, user: string, password: string) {
    return `https://${user}:${password}@${repo}`;
  }

  createIfNotExist(dir: string) {
    if (!fs.existsSync(dir)) {
      this.logger.debug('creating directory ', dir);
      fs.mkdirSync(dir);
    } else {
      this.logger.debug('skipping creation of directory ', dir);
    }
  }
}
