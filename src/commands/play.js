const { SlashCommandBuilder, EmbedBuilder, ComponentType } = require('discord.js');
const { shuffle, buildButtons, disableButtons, addScore } = require('../utils/helperFunctions.js');
const entities = require('entities');
const axios = require('axios');
const wait = require('node:timers/promises').setTimeout;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Start a standard multiple choice game of 5 rounds.'),
    async execute(interaction) {
        // Deferring the reply to allow the application fetching all the requested data
        // otherwise the application will not respond in time
        await interaction.deferReply();

        // API call to get the questions data
        let data;
        try {
            data = await (await axios('https://opentdb.com/api.php?amount=5&type=multiple')).data.results;
        } catch (error) {
            console.log(error);
            return await interaction.channel.send({ content: 'Something went wrong while trying to retrieve the questions... Please try again later!' });
        }

        for (let i = 0; i < data.length; i++) {
            // Results take the following form:
            // {
            //     category: 'Entertainment: Japanese Anime & Manga',
            //     type: 'multiple',
            //     difficulty: 'hard',
            //     question: 'In the first episode of Yu-Gi-Oh: Duel Monsters, what book is Seto Kaiba seen reading at Domino High School?',
            //     correct_answer: 'Thus Spoke Zarathustra',
            //     incorrect_answers: [ 'Beyond Good and Evil', 'The Republic', 'Meditations' ]
            //  }
            const results = data[i];
            const question = entities.decodeHTML(results.question);
            const correctAnswer = entities.decodeHTML(results.correct_answer);
            const category = entities.decodeHTML(results.category);
            const difficulty = results.difficulty;

            // Array that will be stocking the different choices
            const choices = [correctAnswer];
            results.incorrect_answers.forEach(element => {
                choices.push(entities.decodeHTML(element));
            });

            // We shuffle the array so the answer will not be always the first one
            shuffle(choices);
            console.log('Correct response: ' + correctAnswer);

            // Construct an embed with all the questions data
            const embedQuestion = new EmbedBuilder().setTitle(`Question ${i + 1}:\n${question}`)
                .setThumbnail('https://imgur.com/xkCtTxx.png')
                .setFooter({ text: '⏳ You have 10s to answer.' });

            // Instantiate a new embed for the results that will be used later on
            const resultMsgEmbed = new EmbedBuilder().setFooter({ text: 'Let me grab the next question...' });
            let scoreAmount;

            // Set the score amount and the color of the embed based on the question's difficulty
            if (difficulty === 'easy') {
                scoreAmount = 5;
                embedQuestion.setColor('#66ff00')
                resultMsgEmbed.setColor('#66ff00')
            }
            else if (difficulty === 'medium') {
                scoreAmount = 10;
                embedQuestion.setColor('#df8830')
                resultMsgEmbed.setColor('#df8830')
            }
            else {
                scoreAmount = 20;
                embedQuestion.setColor('#e32636')
                resultMsgEmbed.setColor('#e32636')
            }

            let capitalizedDifficulty = difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
            embedQuestion.addFields(
                { name: '\u200B', value: '\u200B' },
                { name: 'Difficulty', value: `${capitalizedDifficulty}`, inline: true },
                { name: 'Points given', value: `${scoreAmount}`, inline: true },
                { name: 'Category', value: `${category}`, inline: true }
            )

            // Variable to hold the answer and compare it with the user's answer later on
            let holdingAnswer = '';
            if (correctAnswer === choices[0]) {
                holdingAnswer = 'answer_A';
            }
            else if (correctAnswer === choices[1]) {
                holdingAnswer = 'answer_B';
            }
            else if (correctAnswer === choices[2]) {
                holdingAnswer = 'answer_C';
            }
            else {
                holdingAnswer = 'answer_D';
            }

            const buttons = buildButtons(choices);
            let message;

            if (!interaction.replied) {
                // Need to edit the reply after deferring otherwise the bot's message will be stuck
                message = await interaction.editReply({ embeds: [embedQuestion], components: buttons, fetchReply: true });
            }
            else {
                message = await interaction.channel.send({ embeds: [embedQuestion], components: buttons, fetchReply: true });
            }

            // Add a createMessageComponentCollector to collect the user's interactions 
            // (in this case when clicking on a button in a message)
            const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10000 });

            // Array holding all the users answering to the quiz
            let userAnswering = [];

            // Start to collect the answers
            collector.on('collect', async i => {
                // Check whether the user's ID property exists in the array or not and if the latter, then add it
                const index = userAnswering.findIndex(x => x.id === i.user.id);

                if (index === -1) {
                    userAnswering.push({ id: i.user.id, username: i.user.username, messageID: i.message.id, answerID: i.customId });
                }
                else {
                    // Allow to change the user's answer without modifying the whole object
                    let newArr = userAnswering.map(u => u.id === i.user.id ? { ...u, answerID: i.customId } : u);
                    // Make a copy of newArr array using the SPREAD operator
                    userAnswering = [...newArr];
                }

                if (userAnswering.length > 1) {
                    await i.update(`${userAnswering.length} users answered!`);
                }
                else {
                    await i.update('Somebody answered!');
                }
            });

            const disabledButtons = disableButtons(buttons, correctAnswer);

            // Will be executed when the collector completes
            collector.on('end', async collected => {
                // Slicing the string to only get the letter (A, B, C or D)
                const answerLetter = holdingAnswer.slice(7);
                // If no interactions collected, send the didn't answer embed message
                if (collected.size === 0) {
                    resultMsgEmbed.setDescription(`The good answer was ${answerLetter}: ${correctAnswer}`)
                    await message.edit({ content: 'Nobody answered!', embeds: [embedQuestion], components: disabledButtons, fetchReply: true })
                    return await interaction.channel.send({ embeds: [resultMsgEmbed] });
                }

                // String to hold all the usernames who answered correctly
                let usernames = '';
                for (let i = 0; i < userAnswering.length; i++) {
                    const element = userAnswering[i];
                    // If the last answer provided by the user correspond to the correct answer,
                    // concatenate the string with the username + amount of points gained and call the addScore function
                    if (element.answerID === holdingAnswer) {
                        usernames += `\n${element.username}: +${scoreAmount} points`;
                        await addScore(element, scoreAmount);
                    }
                }
                usernames === '' ? usernames = '\nNobody had the correct answer!' : usernames;
                resultMsgEmbed.setDescription(`The good answer was ${answerLetter}: ${correctAnswer}\n\nUsers with the correct answer:${usernames}`)

                // Edit the message to replace it with disabled buttons and send the result embed
                await message.edit({ embeds: [embedQuestion], components: disabledButtons, fetchReply: true })
                return await interaction.channel.send({ embeds: [resultMsgEmbed] });
            });

            // Adding a delay of 15s to allow time in between questions, otherwise the for loop will
            // quickly fire all the questions at once
            await wait(15000);
        }

        // Little embed to announce the last round ended
        const endEmbed = new EmbedBuilder()
            .setDescription('It was the last round. You can check your score points with \`/score\` or display the leaderboard with \`/lb\`.')
            .setColor('#4f46e5 ');
        return await interaction.channel.send({ embeds: [endEmbed] });
    }
}