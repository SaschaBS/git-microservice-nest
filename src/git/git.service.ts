import {Injectable, Logger, OnApplicationBootstrap} from '@nestjs/common';
import {EMPTY, from, Subject, switchMap} from 'rxjs';
import {emptyDirSync} from 'fs-extra';
import simpleGit, {SimpleGit, SimpleGitProgressEvent} from 'simple-git';
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class GitService implements OnApplicationBootstrap {
  private git: SimpleGit;
  private gitProgress = new Subject<SimpleGitProgressEvent>();

  private readonly logger = new Logger(GitService.name);
  private repoBaseDir = path.join('C:\\', 'repositories_new');
  private masterBaseDir = path.join(this.repoBaseDir, 'masterBranch');
  private remote;

  constructor() {
    this.git = simpleGit({
      progress: (event: SimpleGitProgressEvent) => this.gitProgress.next(event),
    });
    this.remote = this.getBasicAuthUrl('github.com/SaschaBS/sandbox.git');
  }

  initLocalRepo = () => {
    return from(
        this.git.cwd({path: this.masterBaseDir, root: true}).checkIsRepo(),
    ).pipe(
        switchMap((isRepo) => {
          if (isRepo) {
            this.logger.debug('current dir is already git repo');
            return EMPTY;
          } else {
            this.logger.debug(
                'dir exists, but is not a repo. deleting any files!',
            );
            emptyDirSync(this.masterBaseDir);
            return this.git.clone(this.remote, this.masterBaseDir);
          }
        }),
    );
  };

  onApplicationBootstrap(): any {
    this.createIfNotExist(this.repoBaseDir);
    this.createIfNotExist(this.masterBaseDir);
    this.initLocalRepo().subscribe(() =>
        this.logger.log('successful init of local repo'),
    );
  }

  getBasicAuthUrl(repo: string) {
    const user = process.env.GIT_USER;
    const pass = process.env.GIT_PASSWORD;
    assert(user, 'environment variable GIT_USER not set');
    assert(pass, 'environment variable GIT_PASSWORD not set');
    return `https://${user}:${pass}@${repo}`;
  }

  createIfNotExist(dir: string) {
    if (!fs.existsSync(dir)) {
      this.logger.debug('creating dir ', dir);
      fs.mkdirSync(dir);
    } else {
      this.logger.debug('skipping creation dir ', dir);
    }
  }
}
