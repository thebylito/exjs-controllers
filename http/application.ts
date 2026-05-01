import { createServer, type Server } from 'node:http'

import express, { type Express } from 'express'

import type { ErrorMiddleware, Handler } from '#exjs-controllers/http/httpTypes'

type ListenCallback = () => void
type RouteMethod = 'get' | 'post' | 'put' | 'delete' | 'patch'

export interface Application {
  readonly express: Express
  use(...args: Array<string | Handler | ErrorMiddleware>): Application
  get(path: string, ...handlers: Handler[]): Application
  post(path: string, ...handlers: Handler[]): Application
  put(path: string, ...handlers: Handler[]): Application
  delete(path: string, ...handlers: Handler[]): Application
  patch(path: string, ...handlers: Handler[]): Application
  register(method: RouteMethod, path: string, ...handlers: Handler[]): Application
  listen(port: number, callback?: ListenCallback): Server
  listen(port: number, hostname: string, callback?: ListenCallback): Server
  address(): ReturnType<Server['address']>
  close(callback?: (error?: Error) => void): void
}

export function createApplication(): Application {
  const expressApp = express()
  const server = createServer(expressApp)

  const application: Application = {
    express: expressApp,
    use(...args) {
      expressApp.use(...(args as Parameters<Express['use']>))
      return application
    },
    get(path, ...handlers) {
      expressApp.get(path, ...handlers)
      return application
    },
    post(path, ...handlers) {
      expressApp.post(path, ...handlers)
      return application
    },
    put(path, ...handlers) {
      expressApp.put(path, ...handlers)
      return application
    },
    delete(path, ...handlers) {
      expressApp.delete(path, ...handlers)
      return application
    },
    patch(path, ...handlers) {
      expressApp.patch(path, ...handlers)
      return application
    },
    register(method, path, ...handlers) {
      switch (method) {
        case 'get':
          return application.get(path, ...handlers)
        case 'post':
          return application.post(path, ...handlers)
        case 'put':
          return application.put(path, ...handlers)
        case 'delete':
          return application.delete(path, ...handlers)
        case 'patch':
          return application.patch(path, ...handlers)
      }
    },
    listen(
      port: number,
      hostnameOrCallback?: string | ListenCallback,
      maybeCallback?: ListenCallback,
    ) {
      if (typeof hostnameOrCallback === 'function') {
        return server.listen(port, hostnameOrCallback)
      }

      if (typeof hostnameOrCallback === 'string') {
        return server.listen(port, hostnameOrCallback, maybeCallback)
      }

      return server.listen(port, maybeCallback)
    },
    address() {
      return server.address()
    },
    close(callback) {
      server.close(callback)
    },
  }

  return application
}
