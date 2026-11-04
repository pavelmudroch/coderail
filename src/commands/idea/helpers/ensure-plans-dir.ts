import { Fs } from '@fs';
import { Path } from '@path';
import { join } from '@std/path';

export async function ensurePlansDir(cwd: string): Promise<void> {
    const ideaDirectory = join(cwd, Path.CODERAIL_DIR, Path.PLANS_DIR);
    await Fs.makeDirectory(ideaDirectory);
}
