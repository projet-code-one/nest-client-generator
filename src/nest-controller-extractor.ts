import {
  ClassDeclaration,
  Decorator,
  MethodDeclaration,
  Project,
  SourceFile,
  Type,
} from 'ts-morph';

import {
  HttpClassMetaData,
  HttpFileMetaData,
  HttpMethod,
  HttpMethodMetaData,
  PathParameter,
} from './http.metadata';

export class NestControllerExtractor {
  private readonly httpMethodByDecoratorName: Record<string, HttpMethod> = {
    Get: 'GET',
    Post: 'POST',
    Put: 'PUT',
    Delete: 'DELETE',
    Patch: 'PATCH',
  };

  public extractHttpFilesMetadata(nestProject: Project): HttpFileMetaData[] {
    return nestProject
      .getSourceFiles()
      .filter((sourceFile) => this.isControllerFile(sourceFile))
      .map((sourceFile) => this.extractHttpFileMetadata(sourceFile));
  }

  private isControllerFile(sourceFile: SourceFile): boolean {
    return sourceFile
      .getClasses()
      .some((classDeclaration) => this.isControllerClass(classDeclaration));
  }

  private extractHttpFileMetadata(sourceFile: SourceFile): HttpFileMetaData {
    return {
      apiName: this.extractApiName(sourceFile),
      fileBaseName: this.extractFileBaseName(sourceFile),
      classes: this.extractHttpClassMetaData(sourceFile),
    };
  }

  private extractFileBaseName(sourceFile: SourceFile): string {
    return /([^/]+)\.controller\.ts$/.exec(sourceFile.getBaseName())![1];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private extractApiName(sourceFile: SourceFile): string {
    return 'wip';
  }

  private extractHttpClassMetaData(
    sourceFile: SourceFile,
  ): HttpClassMetaData[] {
    return sourceFile
      .getClasses()
      .filter((classDeclaration) => this.isControllerClass(classDeclaration))
      .map((classDeclaration) =>
        this.extractHttpClassMetaDataFromClassDeclaration(classDeclaration),
      );
  }

  private isControllerClass(classDeclaration: ClassDeclaration): boolean {
    return !!classDeclaration.getDecorator('Controller');
  }

  private extractHttpClassMetaDataFromClassDeclaration(
    classDeclaration: ClassDeclaration,
  ): HttpClassMetaData {
    const basePath = this.extractBasePathFromClassDeclaration(classDeclaration);
    return {
      methods: this.extractHttpMethodMetaDataFromClassDeclaration(
        basePath,
        classDeclaration,
      ),
      baseName: classDeclaration.getName()!.replace(/Controller$/, ''),
    };
  }

  private extractBasePathFromClassDeclaration(
    classDeclaration: ClassDeclaration,
  ): string {
    return this.extractPathOfDecorator(
      classDeclaration.getDecorator('Controller')!,
    );
  }

  private extractPathOfDecorator(decorator: Decorator): string {
    const firstArgument = decorator.getArguments()[0];
    if (!firstArgument) return '';
    return firstArgument.compilerNode.getText().replace(/'/g, '');
  }

  private extractHttpMethodMetaDataFromClassDeclaration(
    basePath: string,
    classDeclaration: ClassDeclaration,
  ) {
    return classDeclaration
      .getMethods()
      .filter((method) => this.isHttpMethod(method))
      .map((method) => this.extractHttpMethodMetaData(basePath, method));
  }

  private isHttpMethod(method: MethodDeclaration) {
    return !!this.getHttpMethodDecorator(method);
  }

  private getHttpMethodDecorator(
    method: MethodDeclaration,
  ): Decorator | undefined {
    return method
      .getDecorators()
      .find((d) => d.getName() in this.httpMethodByDecoratorName);
  }

  private extractHttpMethodMetaData(
    basePath: string,
    method: MethodDeclaration,
  ): HttpMethodMetaData {
    const decorator = this.getHttpMethodDecorator(method)!;

    return {
      name: method.getName()!,
      path: this.parsePath(basePath, decorator, method),
      method: this.httpMethodByDecoratorName[decorator.getName()],
      requestBody: this.extractRequestBody(method),
      responseBody: this.extractResponseBody(method),
      queryParameters: this.extractQueryParametersType(method),
    };
  }

  private parsePath(
    basePath: string,
    decorator: Decorator,
    method: MethodDeclaration,
  ): (string | PathParameter)[] {
    const path = basePath + this.extractPathOfDecorator(decorator);
    return path.split('/').map((p) => {
      const parameterParser = /^:[^(]+/.exec(p);
      if (parameterParser) {
        const parameterName = parameterParser[1];
        const parameterType = this.extractPathParameterType(
          method,
          parameterName,
        );
        return { parameterName, parameterType } as PathParameter;
      }
      return p;
    });
  }

  private extractPathParameterType(
    method: MethodDeclaration,
    parameterName: string,
  ): Type {
    for (const parameter of method.getParameters()) {
      const parameterDecorator = parameter.getDecorator('Param');
      if (parameterDecorator) {
        const parameterDecoratorName = parameterDecorator
          .getArguments()[0]
          .compilerNode.getText()
          .replace(/'/g, '');
        if (parameterDecoratorName === parameterName) {
          return parameter.getType();
        }
        continue;
      }
      const parametersDecorator = parameter.getDecorator('Params');
      if (parametersDecorator) {
        return parametersDecorator
          .getType()
          .getPropertyOrThrow(parameterName)
          .getDeclaredType();
      }
    }
    throw new Error(
      `No parameter with name ${parameterName} found in method ${method.getName()}`,
    );
  }

  private extractRequestBody(
    method: MethodDeclaration,
  ): { name: string; type: Type } | undefined {
    const bodyParameter = method
      .getParameters()
      .find((p) => p.getDecorator('Body') !== undefined);
    if (!bodyParameter) return undefined;
    let bodyParameterType = bodyParameter.getType();
    if (this.isPromiseType(bodyParameterType)) {
      bodyParameterType = bodyParameterType.getTypeArguments()[0];
    }
    return { name: bodyParameter.getName(), type: bodyParameterType };
  }

  private extractResponseBody(
    method: MethodDeclaration,
  ): { type: Type } | undefined {
    let responseType = method.getType();
    if (this.isPromiseType(responseType)) {
      responseType = responseType.getTypeArguments()[0];
    }
    if (responseType.isVoid()) {
      return undefined;
    }
    return { type: responseType };
  }

  private extractQueryParametersType(
    method: MethodDeclaration,
  ): { name: string; type: Type } | undefined {
    const queryParametersParameter = method
      .getParameters()
      .find((p) => p.getDecorator('QueryParams') !== undefined);
    if (!queryParametersParameter) return undefined;
    return {
      name: queryParametersParameter.getName(),
      type: queryParametersParameter.getType(),
    };
  }

  private isPromiseType(type: Type): boolean {
    return type.getText().startsWith('Promise<');
  }
}
