module.exports = {
    type: 'object',
    required: ['SwarmName', 'StackName', 'RoleName', 'Services'],
    additionalProperties: false,
    properties: {
        SwarmName: {
            type: 'string',
            pattern: '[a-zA-Z][a-zA-Z0-9_-]*',
        },
        StackName: {
            type: 'string',
        },
        RoleName: {
            type: 'string',
        },
        Services: {
            type: 'array',
            minItems: 1,
            items: {
                type: 'object',
                required: ['Name', 'Image'],
                additionalProperties: false,
                properties: {
                    Name: {
                        type: 'string',
                    },
                    Image: {
                        type: 'string',
                    },
                    EnvironmentVariables: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['Name', 'Value'],
                            properties: {
                                Name: {
                                    type: 'string',
                                },
                                Value: {
                                    type: 'string'
                                }
                            }
                        }
                    },
                    Secrets: {
                        type: 'array',
                        items: {
                            type: 'string'
                        }
                    },
                    Logging: {
                        type: 'object',
                        required: [],
                        additionalProperties: false,
                        properties: {
                            MultilinePattern: {
                                type: 'string',
                            },
                            DateTimeFormat: {
                                type: 'string'
                            }
                        }
                    }
                }
            }
        },
        Secrets: {
            type: 'array',
            items: {
                type: 'object',
                required: ['Name', 'Source', 'Path'],
                additionalProperties: false,
                properties: {
                    Name: {
                        description: 'name of the secret at /run/secrets/<name>, and also the name of the secret at `docker secret create <stack-name>_<secret-name>_<version>`',
                        type: 'string',
                        pattern: '[a-zA-Z][a-zA-Z0-9_-]*'
                    },
                    Source: {
                        description: 'the service which is holding the secret to be retrieved',
                        type: 'string',
                        enum: [
                            'PARAMETER_STORE'
                        ],
                    },
                    Path: {
                        description: 'dependent on Source, this is the path to get to the secret',
                        type: 'string',
                    },
                    RefreshInterval: {
                        description: 'number of seconds to wait before refreshing this secret again',
                        type: 'integer',
                        minimum: 60,
                        default: 600,
                    }
                }
            }
        },
    }
}