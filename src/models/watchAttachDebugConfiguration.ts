import { DebugConfiguration } from 'vscode';

export interface WatchAttachDebugConfiguration extends DebugConfiguration {
  /**
   * Program to attach to. This is usually the name of the startup `.csproj` file with the `.exe` extension appended.
   *
   * e.g. to debug the process from `dotnet watch run weather.csproj`, set this to `weather.exe`. Do note that this is different depending
   * on your dotnet version.
   *
   * NOTE: This is not required if `pipeTransport` is configured.
   */
  program: string;
  /**
   * The label of a dotnet watch task to run as defined in `tasks.json`
   *
   * This task will automatically be run when the debug session starts, and terminated when the debug session ends.
   *
   * NOTE: It is not required to set `isBackground: true` for this task.
   */
  task?: string;
  /**
   * Pipe transport configuration for remote debugging.
   *
   * When configured, this will be used instead of `processName` for attaching to the debugger.
   * This is useful for remote debugging scenarios or when using custom transport mechanisms.
   *
   * Example:
   * ```json
   * {
   *   "pipeTransport": {
   *     "pipeProgram": "ssh",
   *     "pipeArgs": ["user@remotehost"],
   *     "debuggerPath": "/usr/local/bin/vsdbg"
   *   }
   * }
   * ```
   */
  pipeTransport?: any;
  /**
   * Container name or ID for Docker container debugging.
   *
   * When using `pipeTransport` with Docker, specify the container name or ID here.
   * This is used to check if the process is running inside the container using `docker top`.
   *
   * Example:
   * ```json
   * {
   *   "containerName": "my-app-container"
   * }
   * ```
   */
  containerName?: string;
  /**
   * Maps source file paths between the local machine and the remote machine or container.
   *
   * This is useful when debugging applications running in containers or on remote machines
   * where the source file paths differ from the local development environment.
   *
   * Example:
   * ```json
   * {
   *   "sourceFileMap": {
   *     "/app": "${workspaceFolder}",
   *     "/usr/src/app": "${workspaceFolder}"
   *   }
   * }
   * ```
   */
  sourceFileMap?: { [key: string]: string };
}

export const WATCH_ATTACH_AUTO_NAME = '.NET Watch Attach (Child attach)';

export const defaultCoreClrDebugConfiguration = {
  type: 'coreclr',
  request: 'attach',
  name: WATCH_ATTACH_AUTO_NAME,
};
