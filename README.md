# .NET Container Watch Attach

[![.github/workflows/ci.yml](https://github.com/Trottero/dotnet-watch-attach/actions/workflows/ci.yml/badge.svg)](https://github.com/Trottero/dotnet-watch-attach/actions/workflows/ci.yml)

> **Note:** This is a fork of the original [dotnet-watch-attach](https://github.com/Trottero/dotnet-watch-attach) extension by [Trottero](https://github.com/Trottero), with added support for debugging applications running in Docker containers via `pipeTransport`.

`.NET Container Watch Attach` is an extension which supports developers working with the `dotnet watch` ([link](https://docs.microsoft.com/en-us/aspnet/core/tutorials/dotnet-watch?view=aspnetcore-5.0)) command. It is basically a wrapper around the `coreclr` debugger from the C# extension which watches your process list for a given process name, with added support for debugging applications running in Docker containers via `pipeTransport`.

- [Original Extension](https://marketplace.visualstudio.com/items?itemName=Trottero.dotnetwatchattach)
- [This Fork Extension](https://marketplace.visualstudio.com/items?itemName=LeoLuz.dotnetcontainerwatchattach)

## Requirements

- Microsofts C# extension ([link](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp))

## Configuration

### Local Development (without containers)

Configuration is simple, since `0.2.0` you will only need a single task which defines a command that uses the `dotnet watch` command. This task is then used in the `dotnetcontainerwatchattach` debug configuration. For the `task` property, use the label for the earlier defined task. The `coreclr` attach task is fully configurable using the `args` property.

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

### Container Development (with Docker)

When debugging applications running in Docker containers, you can use `pipeTransport` to connect to the debugger inside the container. The extension will automatically check if the process is running inside the container using `docker top`.

**Important:** The `vsdbg` debugger must be installed inside the container for debugging to work. See the Dockerfile example below.

#### Dockerfile Example

Here's an example Dockerfile that installs `vsdbg` and sets up the environment for debugging:

```dockerfile
# Dockerfile for development with watch + debug

FROM mcr.microsoft.com/dotnet/sdk:9.0

WORKDIR /src

# Install vsdbg (debugger do VS Code) e utilidades
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
      "containerName": "my-app-container",
      "pipeTransport": {
        "pipeProgram": "docker",
        "pipeArgs": ["exec", "-i", "my-app-container"],
        "debuggerPath": "/vsdbg/vsdbg",
        "pipeCwd": "${workspaceFolder}"
      },
      "sourceFileMap": {
        "/app": "${workspaceFolder}",
        "/usr/src/app": "${workspaceFolder}"
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
Start debugging once the container is already running. If you want the container to run when debugging starts, specify a task that will execute `docker run` or `docker compose up`. Like this>
```
// tasks.json
    ...
    {
      "label": "StartContainer",
      "command": "docker",
      "type": "process",
      "linux": {
        "options": {
          "env": {
            "DOTNET_USE_POLLING_FILE_WATCHER": "true"
          }
        }
      },
      "args": ["compose", "up", "--build"],
      "problemMatcher": "$msCompile"
    },
    ...
```

#### Configuration Properties

- **`program`**: Program to attach to. This is usually the name of the startup `.csproj` file, with for windows the `.exe` extension appended. e.g. to debug the process from `dotnet watch run weather.csproj`, set this to `weather.exe` (windows) or `weather` (linux).
- **`task`**: (Optional) The label of a dotnet watch task to run as defined in `tasks.json`. This task will automatically be run when the debug session starts, and terminated when the debug session ends. If not specified, no task will be executed.
- **`pipeTransport`**: (Optional) Pipe transport configuration for remote debugging. When configured, this will be used instead of local process attachment. Useful for debugging applications in Docker containers or on remote machines.
- **`containerName`**: (Optional) Container name or ID for Docker container debugging. Used to check if the process is running inside the container using `docker top`. Required when using `pipeTransport` with Docker.
- **`sourceFileMap`**: (Optional) Maps source file paths between the local machine and the remote machine or container. This is useful when debugging applications running in containers where the source file paths differ from the local development environment.
- **`args`**: (Optional) Arguments passed to underlying coreclr attach configuration.

```
// tasks.json
{
  "tasks": [
    {
      "label": "watch",
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

---

## Features

- ✅ Automatic attachment to .NET processes started by `dotnet watch`
- ✅ Support for Docker container debugging via `pipeTransport`
- ✅ Automatic process detection in containers using `docker top`
- ✅ Source file mapping for container/remote debugging
- ✅ Automatic task execution (disabled when using `pipeTransport`)
- ✅ Retry mechanism with configurable polling interval

## Known Issues

- There is a race condition where the extension checks if the process exists, and if it does it will try to start a debug session moments later. If during that time the process is killed (by rebuilding for example) the debugger will fail to attach and terminate.

Please create an [issue / PR](https://github.com/Trottero/dotnet-watch-attach/issues) for any problems you may encounter.
