import EventEmitter from "events";
import { Client, ConnectConfig } from "ssh2";

export class SSH {
    ready: boolean;
    config: ConnectConfig;

    constructor(config: ConnectConfig) {
        this.ready = false;
        this.config = config;
    }

    exec = async (cmd: string): Promise<string> => {
        return new Promise((resolve, reject) => {
            let buffer = '';
            const ssh = new Client()
                .on('ready', () => {
                    ssh.exec(cmd, {}, (err, channel) => {
                        if (err) {
                            return reject(err);
                        }
                        let buffer = '';
                        let errBuffer = '';
                        channel.on('close', () => {
                            errBuffer ? reject(new Error(`remote command failed:\ncommand: \`${cmd}\`\nresponse: \`${errBuffer}\``)) : resolve(buffer);
                            ssh.end();
                        })
                        .on('data', (data: string) => {
                            buffer += data;
                        })
                        .stderr.on('data', (data: string) => {
                            buffer += data;
                            errBuffer += data;
                        });
                    });
                })
                .on('close', (hadError) => {
                    if (hadError) {
                        reject(buffer);
                    } else {
                        reject(new Error('connection closed'));
                    }
                })
                .connect(this.config);
        });
    }
}
