#!/usr/bin/env node
import { Command } from 'commander';
import { simulateCommand } from './commands/simulate.js';
import { strategiesCommand } from './commands/strategies.js';
import { playCommand } from './commands/play.js';
import { recommendCommand } from './commands/recommend.js';
import { serveCommand } from './commands/serve.js';

const program = new Command();

program
  .name('6nimmt')
  .description('6 Nimmt! game engine, simulator, and AI advisor')
  .version('1.0.0');

program.addCommand(simulateCommand);
program.addCommand(strategiesCommand);
program.addCommand(playCommand);
program.addCommand(recommendCommand);
program.addCommand(serveCommand);

program.parse();
