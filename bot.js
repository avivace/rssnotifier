module.exports = {
    start: function(db, bot, config, HashMap) {

        // Strings
        const errorText_0 = "Mh, something went wrong. Retry the last phase or /cancel to start over"
        const errorText_1 = "Command unrecognised. See /help for the complete list of available commands."
        const errorText_2 = "Something unexpected happened. Please restart from the beginning."
        const errorText_3 = "Nothing to cancel, you're good to go."
        const startText = "Oh hey, welcome! I can send you elements from RSS feeds you provide me. You can specify a query and only matching elements will be notified. See /help for the list of available commands or start by typing `/`"
        const helpText = "Here's the complete list of the commands you can use:\n"+
                         "/start - Start the bot and enable notifications\n"+
                         "/addquery - Subscribe to an RSS feed and provide keywords to match\n"+
                         "/cancel - Cancel every running task and restart\n"+
                         "/status - See the status of every subscription you created\n"+
                         "/disable - Disable a subscription\n"+
                         "/enable - Enable a subscription\n" +
                         "/delete - Delete a subscription\n"+
                         "/edit - Edit the mode, keywords or feed URL of a subscription\n"+
                         "/stop - Stop the notifications\n"+
                         "/info - Informations on the bot\n"
        const cancelText = "The current action was canceled, you can start over."
        const addqueryText_0 = "Great! Send me a list of keywords separated by a single space. Like this: `Doctor` `Who`. If you want the subscription to be in **ready-mode**, so you get a notification for every new message, send /skip ."
        const addqueryText_1A = "Gotcha. Now send me the Feed URL"
        const addqueryText_1B = "Gotcha. Now send me the Feed URL or choose an URL you've already sent"
        const addqueryText_2 = "Yay. I've added the query to your account. You will receive notifications on matching elements"
        const addqueryText_3 = "Sorry, you have already made your choice, please start over with\n/addquery"
        const whitelistDenyText = "You are not allowed to use this bot. Sorry."
        const enableDisableText_0 = "Sorry! You don't have any query to"
        const enableDisableText_1 = "Good! Which one of the queries below do you want to"
        const enableDisableText_2 = "Sorry, you have already made your choice, please start over with\n/"
        const editText_0 = "Sorry, you don't have any query yet, try adding some with\n/addquery"
        const editText_1 = "OK! Which one of the queries below do you want to"
        const editText_2 = "Sorry, you have already made your choice, please start over with\n/"
        const deleteText_0 = "Sorry, you don't have any query yet, try adding some with\n/addquery"
        const deleteText_1 = "OK! Which one of the queries below do you want to"
        const deleteText_2 = "Sorry, you have already made your choice, please start over with\n/"
        const deleteText_3 = "Perfect, no worries! Nothing was deleted, wanna try again with\n/delete?"
        const infoText = "RSS Notifier is an open source Node application. Check the source and contribute on https://github.com/avivace/rssnotifier"
        const skipText = "The subscription is in *read-mode*. "

        // Holds the current conversation state per user
        var convStatusMap = new HashMap();
        // Holds data to be transfered from one step of the conversation to another
        var stepDataTransferMap = new HashMap();
        // Holds current conversation context to know how to respond on next step
        var convContext = new HashMap();
        // Initial conversation handler status
        var status = 0;
        // Element is in array helper function
        var contains = function(needle) {
            // Per spec, the way to identify NaN is that it is not equal to itself
            var findNaN = needle !== needle;
            var indexOf;
            if (!findNaN && typeof Array.prototype.indexOf === 'function') {
                indexOf = Array.prototype.indexOf;
            } else {
                indexOf = function(needle) {
                    var i = -1,
                        index = -1;
                    for (i = 0; i < this.length; i++) {
                        var item = this[i];
                        if ((findNaN && item !== item) || item === needle) {
                            index = i;
                            break;
                        }
                    }
                    return index;
                };
            }
            return indexOf.call(this, needle) > -1;
        };

        function resetConversation(chatId) {
            // TODO: pre validate URL: regex + try to see if it's valid
            // Reset conversation status and context for current user
            convStatusMap.set(chatId, 0)
            convContext.remove(chatId)
        }

        function storeUserQuery(chatId,FeedURL) {
            // At the end of /addquery command, either with manual typing of URL
            // or using an inline button, store current query and feed in db and
            // notify the user
            bot.sendMessage(chatId, addqueryText_2)
            // TODO: check again if we're inserting valid values
            db.run("INSERT INTO `QUERIES`(`ID`,`Keywords`,`Owner`,`FeedURL`,`Active`) VALUES (NULL,?,?,?, 1)", stepDataTransferMap.get(chatId), chatId, FeedURL);
        }

        // Inline keyboards? 
        bot.on('message', (msg) => {
            // TODO: allow use in group: if in group, every message starts with @bot
            //  (privacy activated)
            const chatId = msg.chat.id;
            const message = msg.text;
            console.log("---".cyan.bold)
            console.log(chatId + " : " + message)

            if (!convStatusMap.get(chatId))
                status = 0;
            else
                status = convStatusMap.get(chatId);

            console.log("C Status:" + status)
            if (!config.whitelist_enabled || contains.call(config.whitelist, chatId)) {
                console.log("Allowed")
                    // Fallback /cancel
                if (message.match(/\/cancel\s*/)) {
                    // If status is 0, there's nothing to abort, let's reset anyway (for now)
                    // but notify the user with a differente message (in switch statement)
                    if (status != 0) bot.sendMessage(chatId, cancelText);
                    resetConversation(chatId);
                }
                // Conversation Handling
                var context = convContext.get(chatId);
                switch (status) {
                    case 0:
                        if (message.match(/\/start\s*/))
                            bot.sendMessage(chatId, startText, {parse_mode : 'Markdown'});
                        else if (message.match(/\/info\s*/))
                            bot.sendMessage(chatId, infoText, {parse_mode : 'Markdown'});
                        else if (message.match(/\/help\s*/))
                            bot.sendMessage(chatId, helpText);
                        else if (message.match(/\/addquery\s*/)) {
                            bot.sendMessage(chatId, addqueryText_0, {
                                parse_mode: "Markdown"
                            })
                            convStatusMap.set(chatId, 1)
                            convContext.set(chatId, 'addquery')
                        } else if (message.match(/\/status\s*/)) {
                            // COMPOSE SQL TO MATCH EVERY EXISTENT QUERY
                            var query = "SELECT * FROM QUERIES WHERE Owner = ?"
                            var text = "<b>YOUR QUERIES:</b>" + "\n--------------------------";
                            db.all(query, chatId, function(error, rows) {
                                rows.forEach(function(row) {
                                    if (row.Keywords == "Everything"){
                                        var polishedKeywords = "Everything"
                                    }
                                    else {
                                        var polishedKeywords = 'Keywords: "' + JSON.parse(row.Keywords).join('", "') + '"'
                                    }
                                    var active = "<i>Disabled</i>"
                                    if (row.Active) active = "<b>Enabled</b>"
                                    text = text + "\n\nID: <b>" + row.ID + "</b>\n" + polishedKeywords + "\nFeedURL: " + row.FeedURL + " \n" + active
                                });
                                bot.sendMessage(chatId, text, {
                                    parse_mode: "HTML"
                                })
                            })

                        } else if (message.match(/\/(enable|disable)\s*$/)) {
                            var array = message.match(/\/(enable|disable)\s*$/)
                            var commandText = array[1];
                            var queryTargetStatus = (commandText == 'enable') ? 0 : 1;

                            var gf_Query = 'SELECT ID,FeedURL,Keywords AS keywordGroup FROM QUERIES WHERE Owner = ? AND Active = ?'
                            var gf_Query_Params = [chatId,queryTargetStatus]
                            db.all(gf_Query,gf_Query_Params, function(err,rows){
                                if (rows.length > 0) {
                                    convStatusMap.set(chatId,1);
                                    convContext.set(chatId,commandText)
                                    // Prepare inline_keyboard
                                    var inline_keyboard = [];
                                    var options = {}
                                    // ...build an inline button with that feed data and push it into inline_keyboard array
                                    rows.forEach(function(row) {
                                        var callback_data = JSON.stringify({
                                            context: commandText,
                                            rowId : row.ID
                                            // Passing row.ID (and not entire URL) thus needing another query after callback 
                                            // beacuse of Telegram 64 bytes limit on callback_data
                                        })
                                        // ...BUILDING THE KEYBOARD...
                                        inline_keyboard.push( [{ text: row.keywordGroup + ' on ' + row.FeedURL, callback_data: callback_data }] )
                                    });
                                    // Correctly format current message reply (keyboard)
                                    options.reply_markup = JSON.stringify({
                                            inline_keyboard: inline_keyboard
                                    })
                                    bot.sendMessage(chatId,enableDisableText_1 + ' ' + commandText + '?', options)
                                } else {
                                    resetConversation(chatId);
                                    bot.sendMessage(chatId,enableDisableText_0 + ' *' + commandText + '*!', {
                                        parse_mode : 'Markdown'
                                    })
                                }
                            });
                        } else if (message.match(/\/edit\s*$/)) {
                            var context = 'edit';
                            // Select all stored queries for current user so he can edit one of them
                            var gf_Query = 'SELECT ID,FeedURL,Keywords AS keywordGroup FROM QUERIES WHERE Owner = ?'
                            var gf_Query_Params = [chatId]
                            db.all(gf_Query,gf_Query_Params,function(err,rows) {
                                if (rows.length > 0 ) {
                                    convStatusMap.set(chatId,1)
                                    convContext.set(chatId,context)
                                    // Prepare inline_keyboard
                                    var inline_keyboard = [];
                                    var options = { parse_mode:'Markdown' }
                                    // ...build an inline button with that feed data and push it into inline_keyboard array
                                    rows.forEach(function(row) {
                                        var callback_data = JSON.stringify({
                                            context: context,
                                            rowId : row.ID
                                            // Passing row.ID (and not entire URL) thus needing another query after callback 
                                            // beacuse of Telegram 64 bytes limit on callback_data
                                        })
                                        // ...BUILDING THE KEYBOARD...
                                        inline_keyboard.push( [{ text: row.keywordGroup + ' on ' + row.FeedURL, callback_data: callback_data }] )
                                    });
                                    // Correctly format current message reply (keyboard)
                                    options.reply_markup = JSON.stringify({
                                            inline_keyboard: inline_keyboard
                                    })
                                    bot.sendMessage(chatId,editText_1 + ' *' + context + '*?', options)
                                } else {
                                    resetConversation(chatId);
                                    bot.sendMessage(chatId,editText_0);
                                }
                            });
                        } else if (message.match(/\/delete\s*$/)) {
                            var context = 'delete';
                            var gf_Query = 'SELECT ID,FeedURL,Keywords AS keywordGroup FROM QUERIES WHERE Owner = ?'
                            var gf_Query_Params = [chatId]
                            db.all(gf_Query,gf_Query_Params,function(err,rows){
                                if (rows.length > 0) {
                                    convStatusMap.set(chatId,1);
                                    convContext.set(chatId,context)
                                    // Prepare inline_keyboard
                                    var inline_keyboard = [];
                                    var options = { parse_mode:'Markdown' }
                                    // ...build an inline button with that feed data and push it into inline_keyboard array
                                    rows.forEach(function(row) {
                                        var callback_data = JSON.stringify({
                                            context: context,
                                            rowId : row.ID
                                            // Passing row.ID (and not entire URL) thus needing another query after callback 
                                            // beacuse of Telegram 64 bytes limit on callback_data
                                        })
                                        // ...BUILDING THE KEYBOARD...
                                        inline_keyboard.push( [{ text: row.keywordGroup + ' on ' + row.FeedURL, callback_data: callback_data }] )
                                    });
                                    // Correctly format current message reply (keyboard)
                                    options.reply_markup = JSON.stringify({
                                            inline_keyboard: inline_keyboard
                                    })
                                    bot.sendMessage(chatId,deleteText_1 + ' *' + context + '*?', options)
                                } else {
                                    resetConversation(chatId);
                                    bot.sendMessage(chatId,deleteText_0);
                                }
                            });
                        } else if (message.match(/\/cancel\s*$/)) {
                            // Notify the user, we've got nothing to abort
                            bot.sendMessage(chatId, errorText_3)
                        } else {
                            bot.sendMessage(chatId, errorText_1)
                        }
                        break;

                    case 1:
                        // TODO: pre validate message (only words and spaces)
                        if (message.match(/[A-Za-z\s0-9]*/)) {
                            // Choose behavior for this conversation step based on current
                            // conversation context
                            if (context == 'addquery') {
                                // Select all different Feeds this user already stored so we can suggest them 
                                // to him usign inline buttons
                                var rq_Query = 'SELECT ID,FeedURL FROM QUERIES where Owner = ? GROUP BY FeedURL';
                                var rq_Query_Params = [chatId];
                                db.all(rq_Query, rq_Query_Params, function(error, rows) {
                                    // Prepare inline_keyboard
                                    var inline_keyboard = [];
                                    var textToUser = addqueryText_1A;
                                    var options = {}
                                    // If this user has at least 1 feed already stored...
                                    if (rows.length > 0) {
                                        textToUser = addqueryText_1B;
                                        // ...build an inline button with that feed data and push it into inline_keyboard array
                                        rows.forEach(function(row) {
                                            var callback_data = JSON.stringify({
                                                context: context,
                                                rowId: row.ID
                                                // Passing row.ID (and not entire URL) thus needing another query after callback 
                                                // beacuse of Telegram 64 bytes limit on callback_data
                                            })
                                            // ...BUILDING THE KEYBOARD...
                                            inline_keyboard.push( [{ text: row.FeedURL, callback_data: callback_data }] )
                                        });
                                        // Correctly format current message reply (keyboard)
                                        options.reply_markup = JSON.stringify({
                                                inline_keyboard: inline_keyboard
                                        })
                                    }
                                    var array = JSON.stringify(message.split(' '));
                                    convStatusMap.set(chatId, 2)
                                    if (message == '/skip'){
                                        array = "Everything";
                                        textToUser = skipText + textToUser;
                                    }
                                    stepDataTransferMap.set(chatId, array)
                                    bot.sendMessage(chatId, textToUser, options)
                                });
                            } else if (context == 'enable' || context == 'disable' || context == 'edit' || context == 'delete') {
                                // With enable|disable|edit|delete context on step 1 the user can only use 
                                // an inline button or /cancel, if we receive text let's explain this to him
                                bot.sendMessage(chatId, errorText_0)
                            }
                        } else {
                            bot.sendMessage(chatId, errorText_0)
                        }
                        break;

                    case 2:
                        if (context == 'addquery') {
                            // At this point we have a manually entered URL, let's store it
                            // along with its query and reset the conversation
                            resetConversation(chatId);
                            storeUserQuery(chatId,message);
                        } else if (context == 'edit') {
                            // Let's prepare some values passed in stepDataTransferMap (Hashmap)
                            var rowId = stepDataTransferMap.get(chatId).rowId;
                            var keywordGroup = stepDataTransferMap.get(chatId).query;
                            var feed = stepDataTransferMap.get(chatId).feed;
                            // If user  wants to edit the keywords...
                            if (message.match(/(editkeywords)\s*$/i)) {
                                convStatusMap.set(chatId,3)
                                convContext.set(chatId,'editkeywords')
                                // Send him info about current query keywords and ask him to send new ones to us...
                                bot.sendMessage(chatId,'Perfect! Current keywords are\n*"' + JSON.parse(keywordGroup).join('", "') + '"*\nPlease, send me the new ones',{ 
                                    parse_mode:'Markdown'
                                });
                            // ...if he wants to edit the feed instead...
                            } else if (message.match(/(editfeed)\s*$/i)) {
                                // Retrieve all feeds stored by the user different from the one of current query
                                // (the one we're going to edit) so we can suggest them as alternatives
                                var rq_Query = 'SELECT ID,FeedURL FROM QUERIES where Owner = ? AND FeedURL != ? GROUP BY FeedURL';
                                var rq_Query_Params = [chatId,feed];
                                db.all(rq_Query, rq_Query_Params, function(error, rows) {
                                    // Prepare inline_keyboard
                                    var inline_keyboard = [];
                                    var options = {
                                        parse_mode: 'HTML'
                                    }
                                    // If this user has at least 1 feed, different from current one, already stored...
                                    if (rows.length > 0) {
                                        // ...build an inline button with that feed data and push it into inline_keyboard array
                                        rows.forEach(function(row) {
                                            var callback_data = JSON.stringify({
                                                context: 'edit',
                                                rowId: row.ID
                                                // Passing row.ID (and not entire URL) thus needing another query after callback 
                                                // beacuse of Telegram 64 bytes limit on callback_data
                                            })
                                            // ...BUILDING THE KEYBOARD...
                                            inline_keyboard.push( [{ text: row.FeedURL, callback_data: callback_data }] )
                                        });
                                        // Correctly format current message reply (keyboard)
                                        options.reply_markup = JSON.stringify({
                                                inline_keyboard: inline_keyboard
                                        })
                                    }
                                    convStatusMap.set(chatId,3)
                                    convContext.set(chatId,'editfeed')
                                    bot.sendMessage(chatId,'Perfect! Current Feed URL is\n<b>' + feed + '</b>\nPlease, send me the new one',options);
                                });

                            } else {
                                bot.sendMessage(chatId, errorText_0)
                            }

                        } else if (context == 'delete') {
                            // If user is sure about deleting...
                            if (message.match(/(YES)\s*$/i)) {
                                // Let's prepare some values passed in stepDataTransferMap (Hashmap)
                                var rowId = stepDataTransferMap.get(chatId).rowId;
                                var keywordGroup = stepDataTransferMap.get(chatId).query;
                                var feed = stepDataTransferMap.get(chatId).feed;
                                // Now that we've got all the info, let's procede and delete the query
                                var deleteQuery = "DELETE FROM QUERIES WHERE ID = ? AND Owner = ?;"
                                db.run(deleteQuery, [rowId, chatId], function(){
                                    // Reset the conversation
                                    resetConversation(chatId);
                                    // Notify the user with info about deleted query
                                    bot.sendMessage(chatId, "Bye bye to\n<b>" + keywordGroup + "</b>\non feed\n" + feed + ".\n<b>QUERY DELETED</b>!",{
                                        parse_mode: 'HTML'
                                    });
                                });
                            // ...if not...
                            } else if (message.match(/(NO)\s*$/i)) {
                                // Reset conversation and reassure the user
                                resetConversation(chatId);
                                bot.sendMessage(chatId,deleteText_3);
                            } else {    
                                bot.sendMessage(chatId, errorText_0)
                            }
                        }
                        break;

                        case 3:
                            if (message.match(/[A-Za-z\s0-9]*/)) {
                                if (context == 'editkeywords' || context == 'editfeed') {
                                    // Choose correct db queries based on what we are editing:
                                    // keywords or feed?
                                    if (context == 'editkeywords'){
                                        var array = JSON.stringify(message.split(' '));
                                        var updateQuery = "UPDATE QUERIES SET Keywords = ? WHERE `_rowid_`=? AND Owner = ?;"
                                        var updateQueryParams = [array, stepDataTransferMap.get(chatId).rowId, chatId]
                                    } else if (context == 'editfeed') {
                                        var updateQuery = "UPDATE QUERIES SET FeedURL = ? WHERE `_rowid_`=? AND Owner = ?;"
                                        var updateQueryParams = [message, stepDataTransferMap.get(chatId).rowId, chatId]
                                    }
                                    // Update DB...
                                    db.run(updateQuery, updateQueryParams, function(){
                                        //...and when we have finished retrieve current modified query data to notify the user
                                        var gUpToDateInfo_Query = "SELECT Keywords as keywordGroup,FeedURL FROM QUERIES WHERE `_rowid_`=? AND Owner = ?"
                                        var gUpToDateInfo_Query_Params = [stepDataTransferMap.get(chatId).rowId,chatId]
                                        db.get(gUpToDateInfo_Query,gUpToDateInfo_Query_Params,function(err,row) {
                                            // Reset the conversation
                                            resetConversation(chatId)
                                            // Notify the user with info about edited query
                                            bot.sendMessage(chatId, "<b>Updated!</b>\n\nCurrent query is\n<b>" + row.keywordGroup + "</b>\non feed\n" + row.FeedURL,{
                                                parse_mode: 'HTML'
                                            });
                                        }); 
                                    });
                                }
                            } else {
                                bot.sendMessage(chatId, errorText_0)
                            }
                        break;

                    default:
                        bot.sendMessage(chatId, errorText_2);
                        resetConversation(chatId);
                }
            } else {
                console.log("Denied")
                bot.sendMessage(chatId, whitelistDenyText + " chatId: " + chatId)
            }
        console.log("---".cyan.bold)
        });

        bot.on("callback_query", function(callbackQuery) {
            //console.log(callbackQuery);
            const data = JSON.parse(callbackQuery.data);
            const context = data.context;
            const rowId = data.rowId;
            const chatId = callbackQuery.from.id;

            console.log("---".cyan.bold)
            console.log(chatId + " : Pressed Inline Button\nContext: " + context + '\nFeed ID: ' + rowId)
            console.log("C Status:" + convStatusMap.get(chatId))

            switch (context) {
                // Again choosing behavior based on context...
                case 'addquery':
                    // Check if this button can be used at this moment
                    if (convStatusMap.get(chatId) == 2) {
                        // Retrieve wanted URL through Feed ID (damn Telegram!!! :P)
                        var feed_Query = 'SELECT FeedURL FROM QUERIES WHERE ID = ?';
                        var feed_Query_Params = [rowId];
                        db.get(feed_Query,feed_Query_Params,function(err,row) {
                            // Once we have the URL we wanted let's store it along with its query,
                            // reset the conversation and close the callback
                            resetConversation(chatId)
                            storeUserQuery(chatId,row.FeedURL);
                            bot.answerCallbackQuery(callbackQuery.id,null,1)
                        });
                    } else {
                        // Whoops! This button is not to be used now,
                        // notify the user and reset the conversation!
                        bot.answerCallbackQuery(callbackQuery.id,null,1)
                        bot.sendMessage(chatId, addqueryText_3);
                    }
                break;

                case 'enable':
                case 'disable':
                    // Check if this button can be used at this moment
                    if (convStatusMap.get(chatId) == 1) { 
                        // Set the correct query wanted status based on passed context:
                        // we want to set status 0 for disable context, and 1 for enable
                        var queryWantedStatus = (context == 'enable') ? 1 : 0;
                        // Get info about the feed we're going to enable/disable, this is needed for
                        // bot reply message (more explicit)
                        var gf_Query = 'SELECT Keywords as keywordGroup,FeedURL FROM QUERIES WHERE ID = ?'
                        var gf_Query_Params = [rowId]
                        db.get(gf_Query,gf_Query_Params, function(err,row) {
                            // Now that we've got all the info, let's procede and enable/disable the query
                            var updateQuery = "UPDATE QUERIES SET `Active`= ? WHERE `_rowid_`=? AND Owner = ?;"
                            db.run(updateQuery, [queryWantedStatus, rowId, chatId], function(){
                                // Reset the conversation and close the callback
                                bot.answerCallbackQuery(callbackQuery.id,null,1)
                                resetConversation(chatId)
                                // Notify the user with info about enabled/disable query
                                bot.sendMessage(chatId, "Your query\n<b>" + row.keywordGroup + "</b>\non feed\n" + row.FeedURL + "\nwas <b>" + context + "d</b>!",{
                                    parse_mode: 'HTML'
                                });
                            });
                        });
                    } else {
                        // Whoops! This button is not to be used now,
                        // notify the user and reset the conversation!
                        bot.answerCallbackQuery(callbackQuery.id,null,1)
                        bot.sendMessage(chatId, enableDisableText_2 + context);
                    }
                break;

                case 'edit':
                    // Check if this button can be used at this moment
                    if (convStatusMap.get(chatId) == 1) { 
                        // Get info about the query we're going to edit, this is needed for
                        // bot reply message (more explicit)
                        var gf_Query = 'SELECT Keywords as keywordGroup,FeedURL FROM QUERIES WHERE ID = ?'
                        var gf_Query_Params = [rowId]
                        db.get(gf_Query,gf_Query_Params, function(err,row) {
                            // Set correct conversation step and context
                            convStatusMap.set(chatId,2);
                            convContext.set(chatId,context)
                            // Store target query data in stepDataTransferMap Hashmap
                            stepDataTransferMap.set(chatId,{ rowId:rowId, query:row.keywordGroup, feed:row.FeedURL })
                            // Prepare custom reply keyboard
                            var keyboard = [['/editkeywords','/editfeed']]
                            var options = { parse_mode:'HTML' }
                            // Correctly format current message reply (keyboard)
                            options.reply_markup = JSON.stringify({
                                    keyboard: keyboard,
                                    resize_keyboard: true,
                                    hide_keyboard: true
                            });
                            // Close callback query and ask the user if he wants to edit keywords or feed
                            bot.answerCallbackQuery(callbackQuery.id,null,1)
                            bot.sendMessage(chatId,'Edit query\n<b>' + row.keywordGroup + '</b>\non feed\n' + row.FeedURL + '\nWhat do you want to <b>edit</b>?', options)
                        });

                    } else if (convStatusMap.get(chatId) == 3) {
                        // Get info about the feed we want as new feed for current "in-editing" query
                        var gf_Query = "SELECT FeedURL FROM QUERIES WHERE `_rowid_`=? AND Owner = ?"
                        var gf_Query_Params = [rowId,chatId]
                        db.get(gf_Query,gf_Query_Params,function(err,row){
                            // Update DB...
                            var updateQuery = "UPDATE QUERIES SET FeedURL = ? WHERE `_rowid_`=? AND Owner = ?;"
                            var updateQueryParams = [row.FeedURL, stepDataTransferMap.get(chatId).rowId, chatId]
                            db.run(updateQuery, updateQueryParams, function() {
                                //...and when we have finished retrieve current modified query data to notify the user
                                var gUpToDateInfo_Query = "SELECT Keywords as keywordGroup,FeedURL FROM QUERIES WHERE `_rowid_`=? AND Owner = ?"
                                var gUpToDateInfo_Query_Params = [stepDataTransferMap.get(chatId).rowId, chatId]
                                db.get(gUpToDateInfo_Query, gUpToDateInfo_Query_Params, function(err, row) {
                                    // Reset the conversation and answer callback query
                                    resetConversation(chatId)
                                    bot.answerCallbackQuery(callbackQuery.id,null,1)
                                    // Notify the user with info about edited query
                                    bot.sendMessage(chatId, "<b>Updated!</b>\n\nCurrent query is\n<b>" + row.keywordGroup + "</b>\non feed\n" + row.FeedURL, {
                                        parse_mode: 'HTML'
                                    });
                                });
                            });

                        });
                    } else {
                        // Whoops! This button is not to be used now,
                        // notify the user and reset the conversation!
                        bot.answerCallbackQuery(callbackQuery.id,null,1)
                        bot.sendMessage(chatId, editText_2 + context);
                    }
                break;

                case 'delete':
                    // Check if this button can be used at this moment
                    if (convStatusMap.get(chatId) == 1) {
                        // Get info about the feed we're going to delete, this is needed for
                        // bot reply message (more explicit)
                        var gf_Query = 'SELECT Keywords as keywordGroup,FeedURL FROM QUERIES WHERE ID = ?'
                        var gf_Query_Params = [rowId]
                        db.get(gf_Query,gf_Query_Params, function(err,row) {
                            // Prepare for another conversation step, let's ask the user
                            // if he's sure to delete the query he selected
                            convStatusMap.set(chatId,2);
                            stepDataTransferMap.set(chatId,{ rowId:rowId, query:row.keywordGroup, feed:row.FeedURL })
                            convContext.set(chatId,context)
                            // Prepare custom reply keyboard
                            var keyboard = [['YES','NO']]
                            var options = { parse_mode:'HTML'}
                            // Correctly format current message reply (keyboard)
                            options.reply_markup = JSON.stringify({
                                    keyboard: keyboard,
                                    resize_keyboard: true,
                                    one_time_keyboard: false,
                                    hide_keyboard: true
                            });
                            // Close callback query and ask the user to confirm query deletion
                            bot.answerCallbackQuery(callbackQuery.id,null,1)
                            bot.sendMessage(chatId,'<b>DELETE</b> query\n' + row.keywordGroup + '\non feed\n' + row.FeedURL + '\n<b>ARE YOU SURE?</b>', options)
                        });
                            
                    } else {
                        // Whoops! This button is not to be used now,
                        // notify the user and reset the conversation!
                        bot.answerCallbackQuery(callbackQuery.id,null,1)
                        bot.sendMessage(chatId, deleteText_2 + context);
                    }
                break;
            }
        console.log("---".cyan.bold)
        });
    
    }
};