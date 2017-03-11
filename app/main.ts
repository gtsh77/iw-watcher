/// <reference path="../typings/core-js/index.d.ts" />


console.log('*** WELCOME ***');

class Main {
	protected serverId = 1;
	protected fs = require('fs');
	protected StringDecoder = require('string_decoder').StringDecoder;
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
	protected http = require('http');
	protected map: string = null;
	protected playersNum: number = null;
	public cmd(cmd: string, callback?: (res: string) => void){
		var that = this;
		let sourceconIn = new this.sourcecon("192.168.0.19", 27015); 
		sourceconIn.connect(err => {
		    if(err) return err;
		    sourceconIn.auth("sexxy", err => {
		        if(err) return err;
		        sourceconIn.send(cmd, (err, res) => {
		            if(err) return err; 
		            if(typeof callback === 'function') callback(res);		            
		        });
		    });
		});		
	}
	public storeError(e: string, fileName: string): void {
		this.fs.appendFile(fileName, e, 'utf8', err => null);
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
		this.msgRotation();
		//this.cmd('status', res => console.log(res.toString('utf8')));
	}
	public scanServer(callback?:(string, number) => void): void {
		this.monitor({
	        type: 'csgo',
	        host: '192.168.0.19:27015'
	    },
	    state => {
	        if(state.error) this.storeError(state.error,'scan.error.log');
	        else if(typeof callback === 'function') callback(state.map,state.raw.numplayers);
	    });
	}
	public msgHandler(msg: any): void {
		try {
			//объявим ключевые переменные
			let utMsg = msg.toString('utf8'),
				newRoundRe: RegExp = new RegExp(/World triggered "Round_Start"/),
				commonRe: RegExp = new RegExp(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(say_team|say|changed|disconnected|\bconnected|entered|switched|triggered|attacked|killed|assisted killing)/),
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
			if(playerAction === 'attacked' || playerAction === 'killed' || playerAction === 'assisted killing') this.attackHandler(utMsg, dateLocal);
			else if(playerAction === 'connected') this.authHandler(playerSteamId,playerNickName, dateLocal);
			else if(playerAction === 'disconnected') this.endSession(playerSteamId, dateLocal);
			else if(playerAction === 'changed') this.setNickName(dateLocal, utMsg);
			else if(playerAction === 'say' || playerAction === 'say_team') this.textHandler(dateLocal, utMsg);
			else console.log(`!!! not_specified ${dateLocal.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction}`);
		}
		catch(e){
			let utMsg: string = msg.toString('utf8');
			console.log(`!!! not_parsed: ${utMsg}`);
		}
		//let stMsg: string = msg.toString('utf8').slice(5,-1);
	}
	public attackHandler(stMsg: string, date: Date): void {
		let arMsg: string[] = stMsg.match(/(?:.+)(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(assisted killing|attacked|killed)(?: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+with ")?(\w+)?(?:".+damage ")?(\w+)?(?:".+health ")?(\w+)?(?:".+\(hitgroup ")?([\w|\s]+)?(?:")?/),
			playerNickName = arMsg[1],
			playerSteamId = arMsg[2],
			playerAction = arMsg[3],
			victimNickName = arMsg[4],
			victimSteamId = arMsg[5],
			weapon = arMsg[6],
			damage = arMsg[7],
			rHp = arMsg[8],
			hitgroup = arMsg[9];

			//эмуляция id для ботов
			if(playerSteamId === 'BOT') playerSteamId = `BOT_${playerNickName}`;
			if(victimSteamId === 'BOT') victimSteamId = `BOT_${victimNickName}`;

			//разбор
			if(playerAction === 'killed'){
				console.log(`## ${date.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction} ${victimNickName} - ${victimSteamId} w ${weapon}`);
				//обновим дб
				this.pool.getConnection((e, connection) => {
					if(e) this.storeError(e,'error.log');
					connection.query(`
						-- запишем вин и поинты в профайл
						UPDATE profiles SET wins = wins + 1, points = points + 3, ratio = wins / losses where playerId IN (SELECT id from players where steamId = '${playerSteamId}');
						-- запишем луз в профайл
						UPDATE profiles SET losses = losses + 1, ratio = wins / losses where playerId IN (SELECT id from players where steamId = '${victimSteamId}');
						-- запишем вин и поинты в профайл раунда
						INSERT IGNORE INTO roundprofiles (roundId,playerId,wins,points) 
							SELECT rounds.id,players.id,1,3 FROM rounds 
							INNER JOIN players ON players.steamId = '${playerSteamId}'
							where endedAt IS NULL AND serverId = ${this.serverId} 
						ON duplicate key UPDATE wins = wins + 1, ratio = wins / losses, points = points + 3;
						-- запишем луз в профайл раунда
						INSERT IGNORE INTO roundprofiles (roundId,playerId,losses) 
							SELECT rounds.id,players.id,1 FROM rounds 
							INNER JOIN players ON players.steamId = '${victimSteamId}'
							where endedAt IS NULL AND serverId = ${this.serverId} 
						ON duplicate key UPDATE losses = losses + 1, ratio = wins / losses;	
						-- запишем вин и поинты в профайл сессии
						INSERT IGNORE INTO sessionprofiles (sessionId,playerId,wins,points) 
							SELECT sessions.id,players.id,1,3 FROM sessions 
							INNER JOIN players ON players.steamId = '${playerSteamId}'
							where endedAt IS NULL AND playerId = players.id
						ON duplicate key UPDATE wins = wins + 1, ratio = wins / losses, points = points + 3;
						-- запишем луз в профайл сессии
						INSERT IGNORE INTO sessionprofiles (sessionId,playerId,losses) 
							SELECT sessions.id,players.id,1 FROM sessions 
							INNER JOIN players ON players.steamId = '${victimSteamId}'
							where endedAt IS NULL AND playerId = players.id
						ON duplicate key UPDATE losses = losses + 1, ratio = wins / losses;	
						-- получим поинты
						SELECT points from profiles INNER JOIN players ON players.steamId = '${playerSteamId}' where profiles.playerId = players.id;

					`,(err, res, fields) => {
						if(e) this.storeError(e,'error.log');
						else {
							(playerSteamId !== 'BOT') && this.cmd(`sm_psay ${playerNickName} "+3 points (${res[6][0].points}) for winning ${victimNickName} at ${date.toTimeString().slice(0,date.toTimeString().indexOf(' '))}"`);
						}
					});
					connection.release();
				});
			}
			else if(playerAction === 'assisted killing'){
				console.log(`## ${date.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction} ${victimNickName} - ${victimSteamId}`);
				//обновим дб
				this.pool.getConnection((e, connection) => {
					if(e) this.storeError(e,'error.log');
					connection.query(`
						-- запишем ассист и поинты в профайл
						UPDATE profiles SET assists = assists + 1, points = points + 1 where playerId IN (SELECT id from players where steamId = '${playerSteamId}');
						-- запишем ассист и поинты в профайл раунда
						INSERT IGNORE INTO roundprofiles (roundId,playerId,assists,points) 
							SELECT rounds.id,players.id,1,1 FROM rounds 
							INNER JOIN players ON players.steamId = '${playerSteamId}'
							where endedAt IS NULL AND serverId = ${this.serverId} 
						ON duplicate key UPDATE assists = assists + 1, points = points + 1;
						-- запишем ассист и поинты в профайл сессии
						INSERT IGNORE INTO sessionprofiles (sessionId,playerId,assists,points) 
							SELECT sessions.id,players.id,1,1 FROM sessions 
							INNER JOIN players ON players.steamId = '${playerSteamId}'
							where endedAt IS NULL AND playerId = players.id
						ON duplicate key UPDATE assists = assists + 1, points = points + 1;
						-- получим поинты
						SELECT points from profiles INNER JOIN players ON players.steamId = '${playerSteamId}' where profiles.playerId = players.id;						
					`,(err, res, fields) => {
						if(e) this.storeError(e,'error.log');
						else {
							(playerSteamId !== 'BOT') && this.cmd(`sm_psay ${playerNickName} "+1 point (${res[3][0].points}) for assisting ${victimNickName} at ${date.toTimeString().slice(0,date.toTimeString().indexOf(' '))}"`);							
						}
					});
					connection.release();
				});
			}
			else {
				let newHash: string = this.crypto.randomBytes(5).toString('hex');
				this.pool.getConnection((e, connection) => {
					if(e) this.storeError(e,'error.log');
					connection.query(`
						-- добавим интеракшн
						INSERT INTO interactions 
							(hash,damage,rHealth,hitgroup,createdAt,roundId,srcId,srcSessionId,destId,destSessionId,weaponId)
						SELECT '${newHash}','${damage}','${rHp}','${hitgroup}','${this.buildISO(date)}', rounds.id, sPlayer.id, sSession.id, dPlayer.id, dSession.id, weapons.id from rounds 
						INNER JOIN players AS sPlayer ON sPlayer.steamId = '${playerSteamId}' 
						INNER JOIN players AS dPlayer ON dPlayer.steamId = '${victimSteamId}' 
						INNER JOIN sessions AS sSession ON sSession.playerId = sPlayer.id AND sSession.endedAt IS NULL
						INNER JOIN sessions AS dSession ON dSession.playerId = dPlayer.id AND dSession.endedAt IS NULL
						INNER JOIN weapons ON weapons.name = '${weapon}'
						WHERE rounds.endedAt IS NULL AND rounds.serverId = ${this.serverId} ORDER BY rounds.id DESC LIMIT 1;
					`,
					(e, res, fields) => {
						if(e) this.storeError(e,'error.log');
						connection.release();
					});			
				});

				console.log(`## ${date.toLocaleTimeString()} ${playerNickName} - ${playerSteamId} ${playerAction} ${victimNickName} - ${victimSteamId} w ${weapon} w ${damage} rHp ${rHp} IN ${hitgroup}`);
			}
			
	}
	public authHandler(steamId: string, playerNickName: string, date: Date): void {
		//получим ip адрес игрока из статуса
		//console.log(`(?:"${playerNickName}" )(STEAM_[\d|:]+|BOT)(?:.+ )?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})?(?::.+)?`);
		this.cmd('status',res => {
			//console.log(res.toString());
			let regExp: RegExp = new RegExp(`(?:"${playerNickName}" )(STEAM_[\\d|:]+|BOT)(?:.+ )?(\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3})?(?::.+)?`,`m`),
				stArr: string[] = res.toString().match(regExp),
				ip = stArr[2],
				ipInfo = null;
			//получим инфу по адресу
			ip && this.http.get(`http://ip-api.com/json/${ip}`, res => {
				let data: string = '';
				res.setEncoding('utf8');
				res.on('data',function(chunk){
					data += chunk;
				});
				res.on('end',() => {
					let pData: any = JSON.parse(data);
					if(pData.status === 'success'){
						console.log(`${pData.country} ${pData.city}`);
					}
					else console.log('bad_ip');					
				});
			});
		});	
		//проверим есть ли игрок в базе
		this.pool.getConnection((e, connection) => {
			if(e) this.storeError(e,'error.log');
			connection.query(`SELECT hash from players where steamId = '${steamId}'`,(err, res, fields) => {
				if(e) this.storeError(e,'error.log');
				else if(res.length){
					//создадим сессию
					this.createSession(steamId, date, playerNickName);
					//какие-то ответы
					console.log(`## ${date.toLocaleTimeString()} player auth: ${res[0].hash} ${playerNickName}`);
					this.cmd(`say [${res[0].hash}] ${playerNickName} from auth`);
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
		let newHash: string = this.crypto.randomBytes(3).toString('hex');
		this.pool.getConnection((e, connection) => {
			if(e) this.storeError(e,'error.log');
			connection.query(`
				-- создание учетки
				INSERT INTO players (steamId,hash, createdAt) SELECT '${steamId}','${newHash}', '${this.buildISO(date)}' from DUAL where (SELECT COUNT(*) from players where steamId = '${steamId}') < 1;
				-- создание профиля
				INSERT INTO profiles (nickName, playerId) SELECT '${playerNickName}',id FROM players WHERE steamId = '${steamId}';
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					console.log(`## ${date.toLocaleTimeString()} new player registered: ${newHash} ${playerNickName}`);
					this.cmd(`say ## NEW PLAYER: ${newHash} - ${playerNickName}`);
					connection.release();
			});
			//создадим сессию
			this.createSession(steamId, date, playerNickName);
		});
	}
	public createSession(steamId: string, date: Date, nickname: string): void {
		let newHash: string = this.crypto.randomBytes(4).toString('hex');
		this.pool.getConnection((e, connection) => {
			if(e) this.storeError(e,'error.log');
			connection.query(`
				-- создание сессии
				INSERT INTO sessions (playerId, createdAt, hash) SELECT id, '${this.buildISO(date)}', '${newHash}' from players WHERE steamId = '${steamId}';

				-- добавить в таблицу никнейм
				INSERT INTO nicknames (value,createdAt,roundId,playerId,sessionId) 
				SELECT '${nickname}','${this.buildISO(date)}',rounds.id,players.id,sessions.id from rounds 
					INNER JOIN players ON players.steamId = '${steamId}' 
					INNER JOIN sessions ON sessions.playerId = players.id AND sessions.endedAt IS NULL
				ORDER BY rounds.id DESC LIMIT 1;
				-- обновить профайл
				UPDATE profiles SET nickName = '${nickname}' where playerId IN (SELECT id from players where steamId = '${steamId}');
			`,
			(e, res, fields) => {
				if(e) this.storeError(e,'error.log');
				console.log(`## session created - ${newHash} for ${steamId}`);
				connection.release();
			});			
		});		
	}
	public endSession(steamId: string, date: Date): void {
		this.pool.getConnection((e, connection) => {
			if(e) this.storeError(e,'error.log');
			connection.query(`
				-- простановка endedAt последней сессии
				UPDATE sessions SET endedAt = '${this.buildISO(date)}' where playerId IN (SELECT id from players where steamId = '${steamId}') ORDER BY id DESC LIMIT 1;
			`,
			(e, res, fields) => {
				if(e) this.storeError(e,'error.log');
				console.log(`## session ended ${steamId}`);
				connection.release();
			});			
		});		
	}
	//отдельный метод если change во время игры
	public setNickName(date: Date, stMsg?: string): void {
		//определим стим и новый ник
		let arMsg: string[] = null,
			playerSteamId: string = null,
			newNickName: string = null;
		if(stMsg){
			arMsg = stMsg.match(/(?:L )(\d{2})\/(\d{2})\/(\d{4})(?: - )(\d{2}):(\d{2}):(\d{2})(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(changed|disconnected|\bconnected|entered|switched|triggered|attacked|killed)(?:.+ ")(.+)(?:")/);
			playerSteamId = arMsg[8];
			newNickName = arMsg[10];
		}
		//запросы
		this.pool.getConnection((e, connection) => {
			if(e) this.storeError(e,'error.log');
			connection.query(`
				-- добавить в таблицу никнейм
				INSERT INTO nicknames (value,createdAt,roundId,playerId,sessionId) 
				SELECT '${newNickName}','${this.buildISO(date)}',rounds.id,players.id,sessions.id from rounds 
					INNER JOIN players ON players.steamId = '${playerSteamId}' 
					INNER JOIN sessions ON sessions.playerId = players.id AND sessions.endedAt IS NULL
				WHERE serverId = ${this.serverId} ORDER BY rounds.id DESC LIMIT 1;
				-- обновить профайл
				UPDATE profiles SET nickName = '${newNickName}' where playerId IN (SELECT id from players where steamId = '${playerSteamId}');
			`,
			(e, res, fields) => {
				if(e) this.storeError(e,'error.log');
				console.log(`## nickname stored: ${newNickName}`);
				connection.release();
			});
		});
	}
	public createRound(date: Date): void {
		let newHash: string = this.crypto.randomBytes(3).toString('hex');
		this.scanServer((map,pCnt) => {
			this.pool.getConnection((e, connection) => {
				if(e) this.storeError(e,'error.log');
				connection.query(`
					-- завершим ласт
					UPDATE rounds set endedAt = '${this.buildISO(date)}' WHERE serverId = ${this.serverId} ORDER BY id DESC LIMIT 1;
					-- добавим раунд
					INSERT INTO rounds (hash,createdAt,serverId,mapId) SELECT '${newHash}','${this.buildISO(date)}',${this.serverId},id from maps where name = '${map}';
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					console.log(`## round created ${newHash}`);
					connection.release();
				});
			});
		});		
	}
	public textHandler(date: Date, stMsg: string): void {
		let arMsg: string[] = stMsg.match(/(?:.+)(?:: ")(.[^<\d]+)(?:.+)(STEAM_[\d|:]+|BOT)(?:.+)(say|say_team)(?: ")(.+)(?:")/),
			playerNickName = arMsg[1],
			playerSteamId = arMsg[2],
			playerText = arMsg[4];

		//эмуляция id для ботов
		if(playerSteamId === 'BOT') playerSteamId = `BOT_${playerNickName}`;

		//запишем лог
		this.pool.getConnection((e, connection) => {
			if(e) this.storeError(e,'error.log');
			connection.query(`
				INSERT INTO messages (value,createdAt,roundId,playerId) 
					SELECT '${playerText}','${this.buildISO(date)}',rounds.id,players.id FROM rounds 
					INNER JOIN players ON players.steamId = 'STEAM_1:0:9977876'
					WHERE rounds.endedAt IS NULL AND rounds.serverId = ${this.serverId}
					ORDER BY rounds.id DESC LIMIT 1;
			`,
			(e, res, fields) => {
				if(e) this.storeError(e,'error.log');
				connection.release();
			});
		});

		//разберем нужен ли ответ
		if(playerText === 'rank'){
			this.pool.getConnection((e, connection) => {
				if(e) this.storeError(e,'error.log');
				connection.query(`
					-- получим ранк
					SELECT COUNT(*) AS rank, t.points FROM profiles INNER JOIN players ON players.steamId = '${playerSteamId}' INNER JOIN profiles AS t ON t.playerId = players.id WHERE profiles.points >= t.points;
					-- получим тотал
					SELECT count(*) AS total FROM profiles;
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					this.cmd(`say ${playerNickName} POSITION ${res[0][0].rank}/${res[1][0].total} with ${res[0][0].points} points`);
					connection.release();
				});
			});
		}

		else if(playerText === 'ratio' || playerText === 'total'){
			this.pool.getConnection((e, connection) => {
				if(e) this.storeError(e,'error.log');
				connection.query(`
					-- получим ратио
					SELECT wins, assists, losses, ratio FROM profiles INNER JOIN players ON players.steamId = '${playerSteamId}' WHERE playerId = players.id;
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					this.cmd(`say ${playerNickName} TOTAL WINS: ${res[0].wins}, ASSISTS: ${res[0].assists}, LOSSES: ${res[0].losses}, RATIO: ${res[0].ratio}`);
					connection.release();
				});
			});
		}

		else if(playerText === 'session'){
			this.pool.getConnection((e, connection) => {
				if(e) this.storeError(e,'error.log');
				connection.query(`
					-- получим sessionprofile
					SELECT points,wins,assists,losses,ratio from sessionprofiles 
						INNER JOIN players ON players.steamId = '${playerSteamId}'
						INNER JOIN sessions ON sessions.playerId = players.id AND sessions.endedAt IS NULL 
						WHERE sessionprofiles.sessionId = sessions.id AND sessionprofiles.playerId = players.id;
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					if(res.length){
						this.cmd(`say ${playerNickName} SESSION POINTS: ${res[0].points} WINS: ${res[0].wins}, ASSISTS: ${res[0].assists}, LOSSES: ${res[0].losses}, RATIO: ${res[0].ratio}`);
						connection.release();						
					}
					else {
						this.cmd(`say ${playerNickName} to start new session you need to win or loose`);
					}
				});
			});
		}

		else if(playerText === 'top' || playerText === 'top5'){
			this.pool.getConnection((e, connection) => {
				if(e) this.storeError(e,'error.log');
				connection.query(`
					-- получим топ5
					SELECT nickName,points FROM profiles ORDER BY points DESC LIMIT 5;
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					console.log(res[0].nickName);
					for(let i:number = 0; i < res.length; i++){
						this.cmd(`say #${(i+1)} ${res[i].nickName} ${res[i].points} points`);
					}
					connection.release();
				});
			});			
		}

		else if(playerText === 'top10'){
			this.pool.getConnection((e, connection) => {
				if(e) this.storeError(e,'error.log');
				connection.query(`
					-- получим топ10
					SELECT nickName,points FROM profiles ORDER BY points DESC LIMIT 10;
				`,
				(e, res, fields) => {
					if(e) this.storeError(e,'error.log');
					console.log(res[0].nickName);
					for(let i:number = 0; i < res.length; i++){
						this.cmd(`say #${(i+1)} ${res[i].nickName} ${res[i].points} points`);
					}
					connection.release();
				});
			});			
		}

		else if(playerText === 'time'){
			this.cmd(`say CURRENT TIME: ${date.toTimeString().slice(0,date.toTimeString().indexOf(' '))}`);	
		}

		else return;
	}	
	public msgRotation(): void {
		let adv1: any = setInterval(() => {
			this.cmd('say STAT-COMMANDS: rank, session, ratio, top, time');
		},300000);

		// let adv2: any = setInterval(() => {
		// 	this.cmd('say admin contact telegram: @gtsh77');
		// },360000);
	}

	static msgList(): void {
		//*** сказать
		//L 02/12/2017 - 19:15:30: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" say "rank"

		//*** атака
		//L 02/12/2017 - 19:14:16: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" [224 2229 -127] attacked "Paul<23><BOT><CT>" [334 2434 -127] with "ak47" (damage "27") (damage_armor "4") (health "12") (armor "84") (hitgroup "chest")

		//L 02/12/2017 - 19:14:16: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" [224 2229 -127] attacked "Paul<23><BOT><CT>" [334 2434 -127] with "ak47" (damage "27") (damage_armor "4") (health "0") (armor "79") (hitgroup "chest")

		//*** фраг
		//L 02/12/2017 - 19:14:17: "Shaman<2><STEAM_1:0:9977876><TERRORIST>" [224 2229 -127] killed "Paul<23><BOT><CT>" [334 2434 -63] with "ak47"

		//RL 03/06/2017 - 02:37:07: "Doug<133><BOT><CT>" assisted killing "Wyatt<126><BOT><TERRORIST>"

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

		//кто любит гранаты?
		//select base.srcId,weapons.name AS WEAPON,COUNT(base.srcId) as HIT from interactions AS base INNER JOIN weapons ON weapons.id = weaponId WHERE weapons.name = 'hegrenade' GROUP BY base.srcId ORDER BY HIT DESC;

		//получи ранк
		//select count(*) AS rank from profiles INNER JOIN players ON players.steamId = 'STEAM_1:0:9977876' INNER JOIN profiles AS t ON t.playerId = players.id where profiles.points >= t.points;

	}

}

let main = new Main();
main.init();