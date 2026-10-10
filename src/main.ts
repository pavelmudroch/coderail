import { Conf } from '@conf';

async function bootstrap(): Promise<void> {
    // TODO: locate correct repo root
    const repositoryRoot = Deno.cwd();

    using globalConfigurationFile = await Conf.getGlobalConfigurationFile();
    using localConfigurationFile = await Conf.getLocalConfigurationFile(repositoryRoot);
    const environmentVariables = Deno.env;
    const commandLineArguments = [...Deno.args];
    await Conf.load({
        globalConfigurationFile,
        localConfigurationFile,
        environmentVariables,
        commandLineArguments,
    });
}
