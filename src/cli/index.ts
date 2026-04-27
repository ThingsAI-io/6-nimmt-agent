#!/usr/bin/env node

import { program } from 'commander';

program
  .name('6nimmt')
  .description('6 nimmt! game engine and CLI')
  .version('0.1.0');

program.parse(process.argv);
