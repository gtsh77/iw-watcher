/// <reference path="../typings/core-js/index.d.ts" />


console.log('*** WELCOME ***');

class Main {
	protected dgram = require('dgram').createSocket('udp4');
	protected sourcecon = require('sourcecon');
	protected monitor = require('game-server-query');
	protected pool = require('mysql').createPool({
		connectionLimit : 10,
		multipleStatements: true,
		host            : 'localhost',
		user            : 'stats',
		password        : 'test',
		database		: 'iwstats'		
	});
	protected crypto = require('crypto');
	protected map: string = null;
	protected playersNum: number = null;
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
		str += '.'+((date.getMilliseconds() < 100)?((date.getMilliseconds() < 10)?'00'+date.getMilliseconds():'0'+date.getMilliseconds()):date.getMilliseconds());
		return str;
	}
	public init(): void {
		this.dgram.bind(77,'192.168.0.19');
		this.dgram.on('listening',() => console.log(`Listening to ${this.dgram.address().address} on ${this.dgram.address().port}`));
		this.dgram.on('message', msg => this.msgHandler(msg));
		this.scanServer();
	}
	public scanServer(callback?:(string, number) => void): void {
		this.monitor({
	        type: 'csgo',
	        host: '192.168.0.19:27015'
	    },
	    state => {
	        if(state.error){}
	        else {
	        	this.map = state.map;
	        	this.playersNum = state.raw.numplayers;
	        	if(typeof callback === 'function') callback(state.map,state.raw.numplayers);
	        }
	    });
	}
	public msgHandler(msg: any): void {
		try {
			//объявим ключевые переменные
			let utMsg = msg.toString('utf8'),
				newRoundRe: RegExp = new RegExp(/World triggered "Round_Start"/),
				commonRe: RegExp = new RegExp(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(disconnected|\bconnected|entered|switched|triggered|attacked|killed)/),
				dateLocal = new Date(),
				arMsg: string[] = null,
				playerNickName = null,
				playerSteamId = null,
				playerAction = null;

			//проверим тип сообщение - раунд
			if(newRoundRe.test(utMsg)){
				this.createRound(dateLocal);
				return;
			}
			//проверим тип сообщение - стандарт
			else {
				arMsg = utMsg.match(commonRe);
				playerNickName = arMsg[7];
				playerSteamId = arMsg[8];
				playerAction = arMsg[9];
			}

			//эмуляция id для ботов
			if(playerSteamId === 'BOT') playerSteamId = `BOT_${playerNickName}`;
			//определим суть сообщения
			if(playerAction === 'attacked') return; //this.attackHandler(utMsg);
			else if(playerAction === 'connected') this.authHandler(playerSteamId,playerNickName, dateLocal);
			else if(playerAction === 'disconnected') this.endSession(playerSteamId, dateLocal);
			else if(playerAction === 'changed') this.setNickName(utMsg, dateLocal);
			else console.log(`!!! not_specified ${dateLocal.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction}`);
		}
		catch(e){
			console.log(`!!! not_parsed: ${msg.toString('utf8')}`);
		}
		//let stMsg: string = msg.toString('utf8').slice(5,-1);
	}
	public attackHandler(stMsg: string): void {
		let arMsg: string[] = stMsg.match(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(disconnected|\bconnected|entered|switched|triggered|attacked|killed)(?: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+with ")(\w+)(?:".+damage ")(\w+)(?:".+health ")(\w+)"/),
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
	public authHandler(steamId: string, playerNickName: string, date: Date): void {
		//проверим есть ли игрок в базе
		this.pool.getConnection((err, connection) => {
			if(err) console.log(err);
			connection.query(`SELECT hash from players where steamId = '${steamId}'`,(err, res, fields) => {
				if(err) console.log(err);
				else if(res.length){
					//создадим сессию
					this.createSession(steamId, date);
					//какие-то ответы
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
	public registerNewPlayer(steamId: string, playerNickName: string, date: Date): void {
		let newHash: string = this.crypto.createHash('DSA').update(steamId+'_iwstats').digest('hex').slice(0,6);
		this.pool.getConnection((err, connection) => {
			if(err) console.log(err);
			connection.query(`
				-- создание учетки
				INSERT INTO players (steamId,hash, createdAt) SELECT '${steamId}','${newHash}', '${this.buildISO(date)}' from DUAL where (SELECT COUNT(*) from players where steamId = '${steamId}') < 1;
				-- создание профиля
				INSERT INTO profiles (nickName, playerId) SELECT '${playerNickName}',id FROM players WHERE steamId = '${steamId}';
				`,
				(err, res, fields) => {
					if(err) console.log(err);
					console.log(`## ${date.toLocaleTimeString()} new player registered: ${newHash} ${playerNickName}`);
					this.cmd(`say ## NEW PLAYER: ${newHash} - ${playerNickName}`);
					connection.release();							
			});
			//создадим сессию
			this.createSession(steamId, date);
		});
	}
	public createSession(steamId: string, date: Date): void {
		let newHash: string = this.crypto.createHash('DSA').update(steamId+'_iwstats_new_session_'+(Math.random()*1e12).toFixed(0)).digest('hex').slice(0,8);
		this.pool.getConnection((err, connection) => {
			if(err) console.log(err);
			connection.query(`
				-- создание сессии
				INSERT INTO sessions (playerId, createdAt, hash) SELECT id, '${this.buildISO(date)}', '${newHash}' from players WHERE steamId = '${steamId}';
			`,
			(err, res, fields) => {
				if(err) console.log(err);
				console.log(`## session created - ${newHash} for ${steamId}`);
				connection.release();
			});			
		});		
	}
	public endSession(steamId: string, date: Date): void {
		this.pool.getConnection((err, connection) => {
			if(err) console.log(err);
			connection.query(`
				-- простановка endedAt последней сессии
				UPDATE sessions SET endedAt = '${this.buildISO(date)}' where playerId IN (SELECT id from players where steamId = '${steamId}') ORDER BY id DESC LIMIT 1;
			`,
			(err, res, fields) => {
				if(err) console.log(err);
				console.log(`## session ended ${steamId}`);
				connection.release();
			});			
		});		
	}
	public setNickName(stMsg: string, date: Date): void {
		//определим стим и новый ник
		let arMsg: string[] = stMsg.match(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(changed|disconnected|\bconnected|entered|switched|triggered|attacked|killed)(?:.+ ")(.+)(?:")/),
		playerSteamId = arMsg[8],
		newNickName = arMsg[10];
		//добавить в таблицу

		//обновить профайл
	}
	public createRound(date: Date): void {
		let newHash: string = this.crypto.createHash('DSA').update('iwstats_new_round_'+(Math.random()*1e12).toFixed(0)).digest('hex').slice(0,6);
		this.scanServer((map,pCnt) => {
			this.pool.getConnection((err, connection) => {
				if(err) console.log(err);
				connection.query(`
					-- завершим ласт
					UPDATE rounds set endedAt = '${this.buildISO(date)}' ORDER BY id DESC LIMIT 1;
					-- добавим раунд
					INSERT INTO rounds (hash,createdAt,serverId,mapId) SELECT '${newHash}','${this.buildISO(date)}',1,id from maps where name = '${map}';
				`,
				(err, res, fields) => {
					if(err) console.log(err);
					console.log(`## round created ${newHash}`);
					connection.release();
				});
			});
		});		
	}

	static msgList(): void {
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

		//*** change name
		//L 03/05/2017 - 01:16:08: "Shaman<5><170><STEAM_1:0:9977876><TERRORIST>" changed name to "Shaman"		


	}

	static sql(): void {
		//inner join, group by
		//SELECT sessions.id,sessions.hash,players.steamId, count(*) AS HIT from sessions inner join players on sessions.playerId = players.id GROUP BY players.steamId ORDER BY HIT DESC LIMIT 5;

		//join таблицы со связью 1к1 
		//select * from players inner join profiles limit 1
		//select * from players cross join profiles limit 1

		//last session
		//SELECT players.steamId,sessions.hash,MAX(sessions.createdAt) from sessions INNER JOIN players ON players.id = sessions.playerId GROUP BY playerId;

		//last session date + total sessions
		//SELECT players.steamId,sessions.hash,MAX(sessions.createdAt),COUNT(sessions.playerId) as Total from sessions INNER JOIN players ON players.id = sessions.playerId GROUP BY playerId;		
		//last session date + total sessions + second-after-group-filter (having) + order + limit
		//SELECT players.steamId,sessions.hash,MAX(sessions.createdAt),COUNT(sessions.playerId) as Total from sessions INNER JOIN players ON players.id = sessions.playerId GROUP BY sessions.playerId HAVING Total > 0 ORDER BY Total DESC LIMIT 5;	

		//last 5 sessions + steamIds
		//SELECT players.steamId,sessions.hash,MAX(sessions.createdAt),COUNT(sessions.playerId) as Total from sessions INNER JOIN players ON players.id = sessions.playerId GROUP BY sessions.playerId ORDER BY MAX(sessions.createdAt) DESC LIMIT 5;

	}

}

let main = new Main();
main.init();