import { expect } from '@std/expect';

import { Conf } from '../src/conf.ts';

Deno.test('Conf exposes document operations alongside runtime configuration', async () => {
    const parsed = await Conf.parse(new Blob(['# Choice\nno_color = true']).stream());
    const document = Conf.merge([{ values: parsed.toObject(), comments: parsed.getComments() }]);
    const roundTrip = await Conf.parse(new Blob([Conf.stringify(document)]).stream());
    expect(Conf.validateConfiguration(roundTrip)).toEqual({ noColor: true });
    expect(roundTrip.getComments()).toEqual(new Map([['noColor', ['Choice']]]));
    expect(Conf.createConfiguration().verify.rules).toEqual([]);
    expect(Conf.diagnoseConfiguration).toBeInstanceOf(Function);
    expect(Conf.loadConfiguration).toBeInstanceOf(Function);
    expect(Conf.getLocalConfigurationFile).toBeInstanceOf(Function);
    expect(Conf.getGlobalConfigurationFile).toBeInstanceOf(Function);
});
