/// <reference path="../typings/core-js/index.d.ts" />


console.log('*** WELCOME ***');

class Main {
	protected dgram = require('dgram').createSocket('udp4');
	protected sourcecon = require('sourcecon');
	protected pool = require('mysql').createPool({
		connectionLimit : 10,
		multipleStatements: true,
		host            : 'localhost',
		user            : 'stats',
		password        : 'test',
		database		: 'iwstats'		
	});
	protected crypto = require('crypto');
	public cmd(cmd: string, callback?: (res: string) => void){
		var that = this;
		let sourceconIn = new this.sourcecon("192.168.0.19", 27015); 
		sourceconIn.connect(err => {
		    if(err) return err;
		    sourceconIn.auth("qwerty", err => {
		        if(err) return err;
		        sourceconIn.send(cmd, (err, res) => {
		            if(err) return err; 
		            if(typeof callback === 'function') callback(res);		            
		        });
		    });
		});		
	}
	public readISO(ISOLocal): Date {
		return new Date(ISOLocal+'+03:00');
	}
	public buildISO(date): string {
		if(!date || typeof date !== 'object') return null;
		var str = '';
		date = new Date(date.getTime() + (date.getTimezoneOffset() * 60000) + 10800000);			
		str += date.getFullYear() + '-';
		str += ((date.getMonth() < 10)?'0'+(date.getMonth() + 1):(date.getMonth() + 1)) + '-';
		str += ((date.getDate() < 10)?'0'+date.getDate():date.getDate()) + 'T';
		str += ((date.getHours() < 10)?'0'+date.getHours():date.getHours()) + ':';
		str += ((date.getMinutes() < 10)?'0'+date.getMinutes():date.getMinutes()) + ':';
		str += ((date.getSeconds() < 10)?'0'+date.getSeconds():date.getSeconds());
		return str;
	}
	public init(): void {
		this.dgram.bind(77,'192.168.0.19');
		this.dgram.on('listening',() => console.log(`Listening to ${this.dgram.address().address} on ${this.dgram.address().port}`));
		this.dgram.on('message', msg => this.msgHandler(msg));
	}
	public msgHandler(msg: any): void {
		try {
			let utMsg = msg.toString('utf8'),
				arMsg: string[] = utMsg.match(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(connected|entered|disconnected|switched|triggered|attacked|killed)/),
				m = arMsg[1],
				d = arMsg[2],
				y = arMsg[3],
				h = arMsg[4],
				mi = arMsg[5],
				se = arMsg[6],
				playerNickName = arMsg[7],
				playerSteamId = arMsg[8],
				playerAction = arMsg[9],
				date = new Date(+y,+m-1,+d,+h,+mi,+se);

			if(playerAction === 'attacked') this.attackHandler(utMsg);
			else if(playerAction === 'connected') this.authHandler(playerSteamId,playerNickName,date);
			else console.log(`## ${date.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction}`);
		}
		catch(e){
			console.log(`not_parsed: ${msg.toString('utf8')}`);
		}
		//let stMsg: string = msg.toString('utf8').slice(5,-1);
	}
	public attackHandler(stMsg: string): void {
		let arMsg: string[] = stMsg.match(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(connected|entered|disconnected|switched|triggered|attacked|killed)(?: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+with ")(\w+)(?:".+damage ")(\w+)(?:".+health ")(\w+)"/),
			m = arMsg[1],
			d = arMsg[2],
			y = arMsg[3],
			h = arMsg[4],
			mi = arMsg[5],
			se = arMsg[6],
			playerNickName = arMsg[7],
			playerSteamId = arMsg[8],
			playerAction = arMsg[9],
			victimNickName = arMsg[10],
			victimSteamId = arMsg[11],
			weapon = arMsg[12],
			damage = arMsg[13],
			rHp = arMsg[14],
			date = new Date(+y,+m-1,+d,+h,+mi,+se);

			console.log(`## ${date.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction} ${victimNickName} - ${victimSteamId} w ${weapon} w ${damage} rHp ${rHp}`);
	}
	public registerNewPlayer(steamId: string, playerNickName: string, date: Date): void {
		this.pool.getConnection((err, connection) => {
			if(err) console.log(err);
			connection.query(`

				INSERT INTO players (steamId,hash, createdAt) SELECT '${steamId}','${this.crypto.createHash('DSA').update(steamId+'_iwstats').digest('hex').slice(0,6)}', '${this.buildISO(date)}' from DUAL where (SELECT COUNT(*) from players where steamId = '${steamId}') < 1;

				INSERT INTO profiles (nickName, playerId) SELECT '${playerNickName}',id FROM players WHERE steamId = '${steamId}';

				SELECT hash from players where steamId = '${steamId}'
				`,
				(err, res, fields) => {
					if(err) console.log(err);
					console.log(`## ${date.toLocaleTimeString()} new player registered: ${res[2][0].hash} ${playerNickName}`);
					this.cmd(`say [${res[2][0].hash}] ${playerNickName} new player`);
					connection.release();							
			});
		});
	}
	public authHandler(steamId: string, playerNickName: string, date: Date): void {
		if(steamId === 'BOT') steamId = `BOT_${playerNickName}`;

		//проверим есть ли игрок в базе
		this.pool.getConnection((err, connection) => {
			if(err) console.log(err);
			connection.query(`SELECT hash from players where steamId = '${steamId}'`,(err, res, fields) => {
				if(err) console.log(err);
				else if(res.length){
					console.log(`## ${date.toLocaleTimeString()} player auth: ${res[0].hash} ${playerNickName}`);
					this.cmd(`say [${res[0].hash}] ${playerNickName} auth`);
				}
				else this.registerNewPlayer(steamId, playerNickName, date);
			});
			connection.release();
		});
		//обновим запись в базе или создадим новую
		// this.pool.getConnection((err, connection) => {
		// 	if(err) console.log(err);
		// 	connection.query(`INSERT INTO players (steamId,hash) SELECT '${steamId}','${this.crypto.createHash('DSA').update(steamId+'_iwstats').digest('hex').slice(0,6)}' from DUAL where (SELECT COUNT(*) from players where steamId = '${steamId}') < 1`,(err, rows, fields) => {
		// 		if(err) console.log(err);
		// 	});
		// 	connection.release();
		// });
		//обновим историю никнеймов
		//...
		//...
	}

	static msgList(): void{
		//*** сказать
		//L 02/12/2017 - 19:15:30: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" say "rank"

		//*** атака
		//L 02/12/2017 - 19:14:16: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" [224 2229 -127] attacked "Paul<23><BOT><CT>" [334 2434 -127] with "ak47" (damage "27") (damage_armor "4") (health "12") (armor "84") (hitgroup "chest")

		//L 02/12/2017 - 19:14:16: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" [224 2229 -127] attacked "Paul<23><BOT><CT>" [334 2434 -127] with "ak47" (damage "27") (damage_armor "4") (health "0") (armor "79") (hitgroup "chest")

		//*** фраг
		//L 02/12/2017 - 19:14:17: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" [224 2229 -127] killed "Paul<23><BOT><CT>" [334 2434 -63] with "ak47"

		//*** новый раунд
		//msg L 02/12/2017 - 19:18:38: World triggered "Round_Start"

		//*** флоу коннекта
		// msg L 02/12/2017 - 19:21:20: "Shaman<25><STEAM_1:0:9977876><>" connected, address ""

		// msg L 02/12/2017 - 19:21:21: "Shaman<25><STEAM_1:0:9977876><>" STEAM USERID validated

		// msg L 02/12/2017 - 19:21:24: "Shaman<25><STEAM_1:0:9977876><>" entered the game

		// msg L 02/12/2017 - 19:21:25: "Shaman<25><STEAM_1:0:9977876><Unassigned>" triggered "clantag" (value "")

		// msg L 02/12/2017 - 19:21:32: "Shaman<25><STEAM_1:0:9977876>" switched from team <Unassigned> to <TERRORIST>

		//*** флоу дисконнекта
		// msg L 02/12/2017 - 19:22:58: "Shaman<25><STEAM_1:0:9977876><TERRORIST>" disconnected (reason "Disconnect")

		// msg L 02/12/2017 - 19:22:58: "Shaman<25><STEAM_1:0:9977876><TERRORIST>" triggered "Dropped_The_Bomb"

		// msg L 02/12/2017 - 19:22:58: "Shaman<25><STEAM_1:0:9977876>" switched from team <TERRORIST> to <Unassigned>		
	}

}

let main = new Main();
main.init();