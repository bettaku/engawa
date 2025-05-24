import { Injectable } from '@nestjs/common';
import { GraphQLSchema } from 'graphql';
import SchemaBuilder from '@pothos/core';
import RelayPlugin from '@pothos/plugin-relay';
import ValidationPlugin from '@pothos/plugin-validation';

@Injectable()
export class GraphQLSchemaBuilderService {
	private builder = new SchemaBuilder({
		plugins: [RelayPlugin, ValidationPlugin],
		relay: {
			clientMutationId: 'optional',
			cursorType: 'String',
		},
	});

	constructor() {}

	private defineTypes() {
		this.builder.objectType('User', {
			description: 'CherryPick User',
			fields: (t) => ({}),
		});
	}
}
