import { Type } from 'ts-morph';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
export type PathParameter = { parameterName: string; parameterType: Type };

export interface HttpMethodMetaData {
  name: string;
  path: (string | PathParameter)[];
  method: HttpMethod;
  requestBody?: { name: string; type: Type; method: any };
  responseBody?: { type: Type };
  queryParameters?: { name: string; type: Type };
}

export interface HttpClassMetaData {
  baseName: string; // ex: "Users"
  methods: HttpMethodMetaData[];
}

export interface HttpFileMetaData {
  apiName: string;
  fileBaseName: string; // ex: "users"
  classes: HttpClassMetaData[]; // length = number of controllers classes in the file (generally 1)
}
