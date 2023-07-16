import { join } from 'path';
import {
  ClassDeclaration,
  ParameterDeclarationStructure,
  Project,
  Scope,
  SourceFile,
  StructureKind,
} from 'ts-morph';

import {
  HttpClassMetaData,
  HttpFileMetaData,
  HttpMethodMetaData,
  PathParameter,
} from './http.metadata';

export class ClientGenerator {
  public generateClientFiles(
    project: Project,
    filesMetaData: HttpFileMetaData[],
    fileBasePath: string,
  ): void {
    for (const fileMetaData of filesMetaData) {
      const clientFile = project.createSourceFile(
        join(
          fileBasePath,
          fileMetaData.apiName,
          `${fileMetaData.fileBaseName}.client.ts`,
        ),
        '',
        {
          overwrite: true,
        },
      );
      this.generateClientFile(clientFile, fileMetaData);
      clientFile.saveSync();
    }
  }

  private generateClientFile(
    clientFile: SourceFile,
    httpFileMetaData: HttpFileMetaData,
  ): void {
    for (const httpClassMetaData of httpFileMetaData.classes) {
      this.generateClientClass(clientFile, httpClassMetaData);
    }
  }

  private generateClientClass(
    clientFile: SourceFile,
    httpClassMetaData: HttpClassMetaData,
  ): void {
    const clientClass = clientFile.addClass({
      name: `${httpClassMetaData.baseName}Client`,
      isExported: true,
    });

    for (const httpMethodMetaData of httpClassMetaData.methods) {
      this.generateClientMethod(httpMethodMetaData, clientClass);
    }
  }

  private generateClientMethod(
    httpMethodMetaData: HttpMethodMetaData,
    clientClass: ClassDeclaration,
  ): void {
    const methodType = httpMethodMetaData.method;
    const requestBody = httpMethodMetaData.requestBody;
    const responseBody = httpMethodMetaData.responseBody;
    const queryParameters = httpMethodMetaData.queryParameters;

    const parameters = this.generateHttpMethodParameters(
      httpMethodMetaData,
      httpMethodMetaData.path,
    );

    clientClass.addMethod({
      name: httpMethodMetaData.name,
      returnType: `Promise<${responseBody?.type ?? 'void'}>`,
      parameters,
      isAsync: true,
      scope: Scope.Public,
      statements: (writer) => {
        writer.writeLine(
          `const url = \`${httpMethodMetaData.path
            .map((p) => (typeof p === 'string' ? p : `\${${p.parameterName}}`))
            .join('/')}\`;`,
        );
        writer.writeLine(`return http.request({`);
        writer.writeLine(`  ...options,`);
        writer.writeLine(`  url,`);
        writer.writeLine(`  method: '${methodType}',`);
        if (requestBody) {
          writer.writeLine(`  body: ${requestBody.name},`);
        }
        if (queryParameters) {
          writer.writeLine(`  queryParams: ${queryParameters.name},`);
        }
        writer.writeLine(`});`);
      },
    });
  }

  /**
   * Genrate: (...pathParameter, requestBody, queryParameters, options) => Promise<ResponseType>
   */
  private generateHttpMethodParameters(
    httpMethodMetaData: HttpMethodMetaData,
    path: (string | PathParameter)[],
  ): ParameterDeclarationStructure[] {
    const requestBody = httpMethodMetaData.requestBody;
    const queryParameters = httpMethodMetaData.queryParameters;

    const parameters: ParameterDeclarationStructure[] = [];
    for (const pathParameter of path) {
      if (typeof pathParameter === 'string') continue;
      parameters.push({
        kind: StructureKind.Parameter,
        name: pathParameter.parameterName,
        type: pathParameter.parameterType.getText(),
      });
    }

    if (requestBody) {
      parameters.push({
        kind: StructureKind.Parameter,
        name: requestBody.name,
        type: requestBody.type.getText(),
      });
    }

    if (queryParameters) {
      parameters.push({
        kind: StructureKind.Parameter,
        name: queryParameters.name,
        type: queryParameters.type.getText(),
      });
    }

    parameters.push({
      kind: StructureKind.Parameter,
      name: 'options',
      type: 'RequestOptions',
    });

    return parameters;
  }
}
