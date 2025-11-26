# .NET Container Watch Attach Debugger

`.NET Container Watch Attach` is an extension which supports developers to debug with the `dotnet watch --no-hot-reload` ([link](https://docs.microsoft.com/en-us/aspnet/core/tutorials/dotnet-watch?view=aspnetcore-5.0)) command. It is basically a wrapper around the `coreclr` debugger from the C# extension which watches your process list for a given process name, and every time it restarts, it automatically reattaches. Also support debugging applications running in Docker containers via `pipeTransport`.

It works on Windows and Linux. It hasn't been tested on Mac yet.
It Works with Vscode and Cursor

> **Note:** This is a fork of the original [dotnet-watch-attach](https://github.com/Trottero/dotnet-watch-attach) extension by [Trottero](https://github.com/Trottero), with added support for debugging applications running in Docker containers via `pipeTransport`.


- [Original Extension](https://marketplace.visualstudio.com/items?itemName=Trottero.dotnetwatchattach)
- [This Fork Extension](https://marketplace.visualstudio.com/items?itemName=Leonardodaluzpinto.dotnetcontainerwatchattach)
- [Discord Community](https://discord.gg/SUmWddWT7B)

## Quick start

### Local Development (without containers)

#### Debug Attach

1) Run your application with `dotnet watch run --no-hot-reload` (this flag means that the aplication will restart on each change instead of update binary part in memory)

2) Put this configuration in launch.json (Don't forget to replace <startup_project_name>):
```
// launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "dotnetcontainerwatchattach",
      "request": "launch",
      "name": ".NET Container Watch Attach",
      "args": { // Args to pass to coreclr attach
        "env": {
          "ASPNETCORE_ENVIRONMENT": "Development"
        }
      },
      "program": "<startup-project-name>.exe" // for windows Or "<startup-project-name>" for linux
    }
  ]
}
```
3) Run debug

#### Debug Launch

1) If you want the application to launch instead of just attaching, configure a task for that:
```
// tasks.json
{
  "tasks": [
    {
      "label": "watchTaskName",
      "command": "dotnet",
      "type": "process",
       "linux": {
        "options": {
          "env": {
            // The FileSystemWatcher used by default wasnt working for me on linux, so I switched to the polling watcher.
            "DOTNET_USE_POLLING_FILE_WATCHER": "true"
          }
        }
      },
      "args": [
        "watch",
        "run",
        "${workspaceFolder}/<path-to-project>.csproj",
        "--no-hot-reload", //necessary to application restart on codebase changes
        "/property:GenerateFullPaths=true",
        "/consoleloggerparameters:NoSummary"
      ],
      "problemMatcher": "$msCompile"
    }
  ]
}
```
2) Call taskName in launch.json:
```
// launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "dotnetcontainerwatchattach",
      "request": "launch",
      "name": ".NET Container Watch Attach",
      "args": { // Args to pass to coreclr attach
        "env": {
          "ASPNETCORE_ENVIRONMENT": "Development"
        }
      },
      "task": "watchTaskName", // Label of watch task in tasks.json
      "program": "<startup-project-name>.exe" // for windows Or "<startup-project-name>" for linux
    }
  ]
}
```
3) Run debug.

### Attach to a docker container (Only works with Vscode, Only tested in Linux)

When debugging applications running in Docker containers, you can use `pipeTransport` to connect to the debugger inside the container. The extension will automatically check if the process is running inside the container using `docker top`.
 Container mode does not work in cursor, but you can slip the cursor inside the container using the Dev Containers extension and debug as if you were on the host.
**Important:** In vscode the `vsdbg` debugger must be installed inside the container for debugging to work. See the Dockerfile example below.

#### Dockerfile Example

Here's an example Dockerfile that installs `vsdbg` and sets up the environment for debugging:

1) Create dockerfile:
```dockerfile
# Dockerfile for development with watch + debug

FROM mcr.microsoft.com/dotnet/sdk:9.0

WORKDIR /src

# Install vsdbg (debugger do VS Code) e utilities
RUN apt-get update && \
    apt-get install -y curl unzip procps && \
    curl -sSL https://aka.ms/getvsdbgsh | bash /dev/stdin -v latest -l /vsdbg && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Expor ports
EXPOSE 8080
EXPOSE 8081

# ENTRYPOINT — run dotnet watch using volume code
ENTRYPOINT ["dotnet", "watch", "run", "${workspaceFolder}/TestesDebug.csproj", "--urls", "http://0.0.0.0:8080", "--no-hot-reload", "/property:GenerateFullPaths=true", "/consoleloggerparameters:NoSummary"]
```

**Note about entry:** I'm using `watch run` inside container so that the build changes when codebase change. The appilcation will restart and the extension will re-attach automatically and fast.

**Important**: Ignore the folders obj and bin in volume to avoid vscode lsp conflicts. See docker-compose file example bellow:

2) Create docker-compose.yml:
``docker-compose.yml
version: '3.8'
services:
  back:
    build:
      context: .
      dockerfile: Dockerfile
    ports: 
      # Choose the ports as you prefer.
      - "8080:8080"
      - "8081:8081"
    environment:
      - ASPNETCORE_ENVIRONMENT=Development
      - ASPNETCORE_URLS=http://+:8080
    volumes:
      # exposes codebase files to be watched by the watch run
      - .:/src
      # This folders bellow needs to be ignored
      - /src/obj
      - /src/bin
    # Holds container running
    stdin_open: true
    tty: true

3) Create launch.json:
```
// launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "dotnetcontainerwatchattach",
      "request": "launch",
      "name": ".NET Container Watch Attach (Docker)",
      "program": "<startup-project-name>",
      "containerName": "<my-app-container>", //ex: "containerName": "my-app-container",
      "pipeTransport": {
        "pipeProgram": "docker",
        "pipeArgs": ["exec", "-i", "<my-app-container-name>"], //ex: "pipeArgs": ["exec", "-i", "my-app-container"],
        "debuggerPath": "/vsdbg/vsdbg",
        "pipeCwd": "${workspaceFolder}"
      },
      "sourceFileMap": {
        "/app": "${workspaceFolder}"
      },
      "args": {
        "env": {
          "ASPNETCORE_ENVIRONMENT": "Development"
        }
      }
    }
  ]
}
```
#### Configuration Properties

- **`program`**: Program to attach to. This is usually the name of the startup `.csproj` file, with for windows the `.exe` extension appended. e.g. to debug the process from `dotnet watch run weather.csproj`, set this to `weather.exe` (windows) or `weather` (linux).
- **`task`**: (Optional) The label of a dotnet watch task to run as defined in `tasks.json`. This task will automatically be run when the debug session starts, and terminated when the debug session ends. If not specified, no task will be executed.
- **`pipeTransport`**: (Optional) Pipe transport configuration for remote debugging. When configured, this will be used instead of local process attachment. Useful for debugging applications in Docker containers or on remote machines.
- **`containerName`**: (Optional) Container name or ID for Docker container debugging. Used to check if the process is running inside the container using `docker top`. Required when using `pipeTransport` with Docker.
- **`sourceFileMap`**: (Optional) Maps source file paths between the local machine and the remote machine or container. This is useful when debugging applications running in containers where the source file paths differ from the local development environment.
- **`args`**: (Optional) Arguments passed to underlying coreclr attach configuration.

4) Run the container with docker compose up

5) Run debug

---

## Features

- ✅ Automatic attachment to .NET processes started by `dotnet watch`
- ✅ Support for Docker container debugging via `pipeTransport`
- ✅ Automatic process detection in containers using `docker top`
- ✅ Source file mapping for container/remote debugging
- ✅ Automatic task execution (disabled when using `pipeTransport`)
- ✅ Retry mechanism with configurable polling interval
- ✅ It works with Cursor, which works with netcoredbg, But it doesn't work with containers unless you use the dev containers extension.

## Known Issues

- Might be issues on Mac. The original ran on Mac, but I haven't been able to test it after my changes. I modified the part that obtains the process ID based on the process name. If any Mac user could look into this for me, I would appreciate it.
- There is a race condition where the extension checks if the process exists, and if it does it will try to start a debug session moments later. If during that time the process is killed (by rebuilding for example) the debugger will fail to attach and terminate.

Please create an [issue / PR](https://github.com/Trottero/dotnet-watch-attach/issues) for any problems you may encounter.
