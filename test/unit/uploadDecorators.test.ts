import { describe, it, expect } from 'vitest'

import { Controller } from '#exjs-controllers/decorators/Controller'
import { Post } from '#exjs-controllers/decorators/HttpMethod'
import { UploadedFile, UploadedFiles } from '#exjs-controllers/decorators/Params'
import { legacyParamMap } from '#exjs-controllers/metadata/legacyStorage'
import { generateOpenApiDocument } from '#exjs-controllers/openapi/generateOpenApiDocument'
import type { ExpressServerOptions } from '#exjs-controllers/config/expressServerOptions'

@Controller('/files')
class FilesController {
  @Post('/one') one(@UploadedFile('document') _file: unknown) {}

  @Post('/many') many(@UploadedFiles('docs') _files: unknown[]) {}

  @Post('/opts')
  opts(
    @UploadedFile('document', { options: { limits: { fileSize: 1024 } } })
    _file: unknown,
  ) {}
}

function makeOptions(): ExpressServerOptions {
  return { openapi: { documentation: { info: { title: 'X', version: '1' } } } }
}

describe('upload decorators — metadata', () => {
  it('registra uploaded-file com nome do campo', () => {
    const params = legacyParamMap.get(FilesController.prototype)!
    expect(params.get('one')![0]).toMatchObject({
      type: 'uploaded-file',
      name: 'document',
      index: 0,
    })
  })

  it('registra uploaded-files', () => {
    const params = legacyParamMap.get(FilesController.prototype)!
    expect(params.get('many')![0]).toMatchObject({
      type: 'uploaded-files',
      name: 'docs',
    })
  })

  it('guarda as opções do multer', () => {
    const params = legacyParamMap.get(FilesController.prototype)!
    expect(params.get('opts')![0]?.uploadOptions).toEqual({
      options: { limits: { fileSize: 1024 } },
    })
  })
})

describe('upload decorators — OpenAPI', () => {
  it('gera requestBody multipart/form-data com campo binário', () => {
    const doc = generateOpenApiDocument([FilesController], makeOptions())
    const schema =
      doc.paths['/files/one']?.post?.requestBody?.content['multipart/form-data']
        ?.schema as Record<string, any>

    expect(schema?.type).toBe('object')
    expect(schema?.properties?.document).toEqual({
      type: 'string',
      format: 'binary',
    })
    expect(schema?.required).toContain('document')
  })

  it('gera array de binário para uploaded-files', () => {
    const doc = generateOpenApiDocument([FilesController], makeOptions())
    const schema =
      doc.paths['/files/many']?.post?.requestBody?.content[
        'multipart/form-data'
      ]?.schema as Record<string, any>

    expect(schema?.properties?.docs).toEqual({
      type: 'array',
      items: { type: 'string', format: 'binary' },
    })
  })
})
