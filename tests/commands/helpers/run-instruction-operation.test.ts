import { Install } from '../../../src/commands/install.ts';
import { Uninstall } from '../../../src/commands/uninstall.ts';
import { registerInstructionTests } from './instruction-operation.ts';

registerInstructionTests(new Install());
registerInstructionTests(new Uninstall());
