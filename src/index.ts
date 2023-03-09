import { EIssue } from './types/enums';
import { exec } from 'child_process';
import os from 'os';
import fs from 'fs';

interface ParsedPing {
	message: string;
	success: boolean | null;
	timestamp: Date;
	note: string | null;
	parsed: null | {
		target: string;
		size: number;
		responseTime: number;
		ttl: number;
	};
}

export function getFilename() {
	const now = new Date();
	const filename = now.toISOString().split('T')[0] + '.csv';

	return filename;
}

function win32PingParser(message: string): ParsedPing {
	try {
		if (message === '\r\nPinging 8.8.8.8 with 32 bytes of data:\r\n') throw Error(EIssue.CMD_STARTUP);
		const parsedMessage = message.match(/Reply from (?<target>[\s\S]*?)\: bytes=(?<size>[\d]*) time=(?<responseTime>[\d]*)ms TTL=(?<ttl>[\d]*)/);
		if (parsedMessage === null && message.includes('=')) throw Error(EIssue.PARTIAL_OUTPUT);
		else if (parsedMessage === null) throw Error(EIssue.ICMP_ERROR);

		return {
			message: message.replace(/\r|\n/g, ''),
			success: true,
			timestamp: new Date(),
			note: null,
			parsed: {
				target: parsedMessage.groups?.target as string,
				size: Number(parsedMessage.groups?.size),
				responseTime: Number(parsedMessage.groups?.responseTime),
				ttl: Number(parsedMessage.groups?.ttl)
			}
		};
	} catch (err) {
		const error = err as Error;
		return {
			message,
			success: (error.message !== EIssue.CMD_STARTUP)
				? (error.message === EIssue.PARTIAL_OUTPUT)
				: null,
			timestamp: new Date(),
			parsed: null,
			note: error.message
		};
	}
}

function writeData(data: ParsedPing) {
	const filename = getFilename();

	if (dataList.length >= QUEUE_LENGTH) {
		const rawData = dataList.map((e) => JSON.stringify(e)).join(os.EOL) + os.EOL;
		dataList = [data];
		if (!fs.existsSync(`./data/${filename}`)) console.log('NEW_FILE:', filename);
		fs.appendFileSync(`./data/${filename}`, rawData, 'utf8');
	} else {
		dataList.push(data);
	}
}

function setup() {
	console.log('=== SETUP ===');

	// New directory
	if (!fs.existsSync('./data/')) {
		console.log('Setting up data directory');
		fs.mkdirSync('data');
	}

	console.log('Done!');
}

function win32Ping() {
	const command = exec('ping -t 8.8.8.8');
	if (command.stdout) command.stdout.on('data', (data) => {
		let parsedData = win32PingParser(data);
		if (parsedData.note === EIssue.PARTIAL_OUTPUT) {
			partial += parsedData.message;
			parsedData = win32PingParser(partial);
			if (parsedData.note === EIssue.PARTIAL_OUTPUT) return;
			partial = '';
		}
		writeData(parsedData);
	});
}

function main() {
	console.log('=== START ===');
	const platform = os.platform();
	console.log('Running OS:', platform);
	if (platform === 'win32') {
		win32Ping();
	} else {
		console.error(`Sorry, "${platform}" OS is currently not supported`);
		process.exit(1);
	}
}

const QUEUE_LENGTH = 25;
let partial = '';
let dataList: ParsedPing[] = [];

setup();
main();
