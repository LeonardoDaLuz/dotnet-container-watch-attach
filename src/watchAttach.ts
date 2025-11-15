import { execFileSync } from 'child_process';
import {
  BehaviorSubject,
  catchError,
  delay,
  from,
  mapTo,
  Observable,
  of,
  retryWhen,
  Subject,
  Subscription,
  switchMap,
  tap,
} from 'rxjs';
import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import { WatchAttachLogger } from './logging/watchAttachLogger';
import {
  defaultCoreClrDebugConfiguration,
  WatchAttachDebugConfiguration,
  WATCH_ATTACH_AUTO_NAME,
} from './models/watchAttachDebugConfiguration';

export class WatchAttach implements Disposable {
  public get config(): WatchAttachDebugConfiguration {
    return this._session?.configuration as WatchAttachDebugConfiguration;
  }

  private _tryAttach = new Subject<vscode.DebugSession>();

  private _session: vscode.DebugSession | null = null;

  private _taskExecution: Thenable<vscode.TaskExecution> | null = null;

  private _pollingInterval = 100;

  private _tryAttachSubscription: Subscription;

  private _disposables: Disposable[] = [];

  private _watchAttachLogger = WatchAttachLogger.instance;

  private _errorCount = 0;

  constructor() {
    this._tryAttachSubscription = this._tryAttach
      .pipe(
        switchMap((debugSession) =>
          this.attach(debugSession).pipe(
            retryWhen((errors) =>
              errors.pipe(
                tap((_) => {
                  if (this._errorCount >= 500) {
                    throw new Error('Error count has reached 5 - stopping retry attempts');
                  }
                }),
                delay(this._pollingInterval)
              )
            ),
            catchError((error: Error) => {
              this._watchAttachLogger.log('Error occurred: ' + error.message);
              this._watchAttachLogger.log('If you see this, please file an issue on GitHub');
              return of(5);
            })
          )
        )
      )
      .subscribe();
  }

  public startWatchAttach() {
    const onStartDebug = vscode.debug.onDidStartDebugSession((debugSession) => {
      // Only start if it was started by this extension.
      if (debugSession.type !== 'dotnetcontainerwatchattach') {
        return;
      }

      // Upon starting the debug session, store the parent in this service and try to attach a .NET debugger
      this._session = debugSession;
      this._tryAttach.next(debugSession);

      // If the user has defined a specific task to run, run it.
      if (this.config.task) {
        this.startExternalTask(this.config.task);
      }
    });
    this._disposables.push(onStartDebug);

    const onTerminateDebug = vscode.debug.onDidTerminateDebugSession((debugSession) => {
      // If the automatically created process was terminated
      // This is also what happens when the application reload
      if (debugSession.name === WATCH_ATTACH_AUTO_NAME) {
        this._watchAttachLogger.log('Child debug session terminated, restarting...');
        // Use the existing session as param.
        if (this._session !== null) {
          this._tryAttach.next(this._session as vscode.DebugSession);
        }
      }

      // If parent process was closed (the user stopped the debug session)
      if (debugSession.type === 'dotnetcontainerwatchattach') {
        this._watchAttachLogger.log('Host debug session terminated, cleaning up...');
        this._session = null;

        // Dispose of the task execution if it exists.
        if (this._taskExecution !== null) {
          this._watchAttachLogger.log(
            'A task was configured; terminating the task launched by ContainerWatch Attach'
          );
          this._taskExecution.then((taskExecution) => {
            taskExecution.terminate();
            this._taskExecution = null;
          });
        }
      }
    });
    this._disposables.push(onTerminateDebug);
  }

  public attach(watchAttachSession: vscode.DebugSession): Observable<number> {
    // Behaviour subject so the observable is hot.
    return new BehaviorSubject(0).pipe(
      switchMap((_) => {
        // Check if pipeTransport is configured
        const hasPipeTransport = !!(this.config.pipeTransport || this.config.args?.pipeTransport);
        
        // Check if application is running
        if (!hasPipeTransport && !this.applicationRunning(this.config.program)) {
          // Errors are caught by the retry.
          throw new Error('Application not running');
        } else if (hasPipeTransport && !this.applicationRunning(this.config.program)) {
          // For pipeTransport, also check if application is running (e.g., in container)
          throw new Error('Application not running');
        }

        const logMessage = hasPipeTransport 
          ? 'Attaching via pipeTransport...' 
          : `Attaching to ${this.config.program}...`;
        this._watchAttachLogger.log(logMessage);

        // Build debug configuration
        const debugConfig: any = {
          ...this.config.args,
          ...defaultCoreClrDebugConfiguration,
        };

        // Add pipeTransport if present, otherwise use processName
        if (hasPipeTransport) {
          debugConfig.pipeTransport = this.config.pipeTransport || this.config.args?.pipeTransport;
          // Use processName when using pipeTransport (standard property for pipeTransport configurations)
          debugConfig.processName = this.config.program;
        } else {
          debugConfig.processName = this.config.program;
        }

        // Add sourceFileMap if present (can be in config or args)
        if (this.config.sourceFileMap || this.config.args?.sourceFileMap) {
          debugConfig.sourceFileMap = this.config.sourceFileMap || this.config.args?.sourceFileMap;
        }

        // Start coreclr debug session.
        return from(
          vscode.debug
            .startDebugging(
              undefined,
              debugConfig,
              {
                parentSession: watchAttachSession,
                consoleMode: vscode.DebugConsoleMode.MergeWithParent,
                compact: true,
              }
            )
            .then((success) => {
              if (!success) {
                const errorMessage = hasPipeTransport
                  ? `Watch Attach failed to attach via pipeTransport, count: ${this._errorCount + 1}`
                  : `The running program check passed but Watch Attach failed to attach to ${
                      this.config.program
                    }, count: ${this._errorCount + 1}`;
                this._watchAttachLogger.log(errorMessage);
                this._errorCount++;
                throw new Error('Application not running');
              }
              const successMessage = hasPipeTransport
                ? 'Successfully attached via pipeTransport'
                : `Successfully attached to ${this.config.program}`;
              this._watchAttachLogger.log(successMessage);
              this._errorCount = 0;
            })
        ).pipe(mapTo(this._errorCount));
      })
    );
  }

  public applicationRunning(programName: string): boolean {
    // Check if pipeTransport is configured and containerName is provided
    const hasPipeTransport = !!(this.config.pipeTransport || this.config.args?.pipeTransport);
    const containerName = this.config.containerName;

    // If using pipeTransport with container, check process inside container
    if (hasPipeTransport && containerName) {
      try {
        const args = ['top', containerName];
        const result = execFileSync('docker', args, {
          encoding: 'utf8',
        });
        // Log the docker top output
        this._watchAttachLogger.log(`docker top ${containerName} output:\n${result}`);
        
        // Check if the program name appears in the docker top output
        // The output format is: PID USER TIME COMMAND
        // We look for the program name in the command column
        const programNamePattern = new RegExp(programName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const processFound = programNamePattern.test(result);
        
        if (processFound) {
          this._watchAttachLogger.log(`Container process '${programName}' found`);
        }
        
        return processFound;
      } catch (error: any) {
        // If docker command fails, log and return false
        const errorMessage = error instanceof Error ? error.message : String(error);
        this._watchAttachLogger.log(`Failed to check container process: ${errorMessage}`);
        return false;
      }
    }

    // Original logic for local process checking
    if (process.platform === 'win32') {
      const args = ['-NoProfile', 'tasklist', '/fi', `"IMAGENAME eq ${programName}"`];
      const result = execFileSync('powershell.exe', args, {
        encoding: 'utf8',
      });
      return result.includes(programName.slice(0, 25));
    } else if (process.platform === 'linux') {
      const args = ['-eo', 'cmd'];
      const result = execFileSync('ps', args, {
        encoding: 'utf8',
      });
      const reg = new RegExp(`\/bin.*\/net.*\/${programName}`);
      return reg.test(result);
    } else if (process.platform === 'darwin') {
      const args = ['-aco', 'command'];
      const result = execFileSync('ps', args, {
        encoding: 'utf8',
      });
      return result.includes(programName);
    }
    return false;
  }

  private startExternalTask(taskName: string): void {
    vscode.tasks.fetchTasks().then((taskList) => {
      const taskDefinition = taskList.filter((task) => task.name === taskName)?.[0];
      if (!taskDefinition) {
        // Let the user know that the task is not found.
        vscode.window.showErrorMessage(
          `Debugger can not be started, task "${taskName}" not found. Check if it is defined in your tasks.json file.`,
          'Close'
        );
        vscode.debug.stopDebugging(this._session as vscode.DebugSession);
        return;
      }

      this._taskExecution = vscode.tasks.executeTask(taskDefinition);
    });
  }

  dispose() {
    this._tryAttachSubscription.unsubscribe();
    this._disposables.forEach((x) => x.dispose());
  }
}
