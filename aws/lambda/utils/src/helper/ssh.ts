import SSH2 from "ssh2-promise";

export class SSH {
    ssh: SSH2;
    
    constructor(ssh: SSH2) {
        this.ssh = ssh;
    }

    exec = async (cmd: string): Promise<string> => {
        try {
            return await this.ssh.exec(cmd);
        } catch(error) {
            if(error instanceof Buffer) {
                throw new Error(`command \`${cmd}\` encountered an error: \n${error.toString('utf-8')}`);
            }
            throw error;
        }
    }
}
