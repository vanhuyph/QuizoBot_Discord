const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const entities = require('entities');
const axios = require('axios');
const wait = require('node:timers/promises').setTimeout;

/***************************************************************************************
* Author: Jeff
* Availability: https://stackoverflow.com/questions/6274339/how-can-i-shuffle-an-array
*
***************************************************************************************/
function shuffle(array) {
    var i, j, temporaryValue;
    for (i = array.length - 1; i > 0; i--) {
        j = Math.floor(Math.random() * (i + 1));
        temporaryValue = array[i];
        array[i] = array[j];
        array[j] = temporaryValue;
    }
    return array;
}

/**
 * Function to help build the answer buttons
 * @param {*} answers the answers to build the buttons for 
 * @returns an array with the built buttons
 */
function buildButtons(answers) {
    let buttons = new ActionRowBuilder();
    const letters = ['A', 'B', 'C', 'D']
    for (let i = 0; i < answers.length; i++) {
        let style, text;
        text = `${letters[i]}: ${answers[i]}`;
        style = ButtonStyle.Secondary;

        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId("answer_" + letters[i])
                .setLabel(text)
                .setStyle(style)
        );
    }
    return [buttons];
}

/**
 * Function to disable the answer buttons and 
 * set the color to the correct answer
 * @param {*} buttons the buttons to disable
 * @param {*} correctAnswer the answer to set the color
 * @returns an array with the disabled buttons
 */
function disableButtons(buttons, correctAnswer) {
    let disabledButtons = new ActionRowBuilder();
    const length = buttons[0].components.length;
    const letters = ['A', 'B', 'C', 'D']
    for (let i = 0; i < length; i++) {
        if (buttons[0].components[i].data.label === `${letters[i]}: ${correctAnswer}`) {
            buttons[0].components[i].setStyle(ButtonStyle.Success);
        }
        disabledButtons.addComponents(buttons[0].components[i].setDisabled(true));
    }
    return [disabledButtons]
}

module.exports = {
    data: new SlashCommandBuilder().setName('play').setDescription('Start a game'),
    async execute(interaction) {
        // API call to get the questions data
        const data = await (await axios('https://opentdb.com/api.php?amount=2&category=31&type=multiple')).data.results;

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
            console.log(results);
            const question = entities.decodeHTML(results.question);
            const correctAnswer = entities.decodeHTML(results.correct_answer);
            const category = entities.decodeHTML(results.category);
            const choices = [correctAnswer];
            results.incorrect_answers.forEach(element => {
                choices.push(entities.decodeHTML(element));
            });
            shuffle(choices);
            console.log(correctAnswer);

            // Construct an embed with all the questions data
            const embedQuestion = new EmbedBuilder().setTitle(`Question ${i + 1}:\n${question}`)
            .setDescription(
                '\n**Choices:**\n' +
                '\n 🇦 ' + choices[0] +
                '\n\n 🇧 ' + choices[1] +
                '\n\n 🇨 ' + choices[2] +
                '\n\n 🇩 ' + choices[3])
            .setTimestamp()
            .setFooter({ text: category + '\nYou have 10s to answer.' });

            let holdingAnswer = '';
            if (correctAnswer === choices[0]) {
                holdingAnswer = 'anwser_A';
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
                message = await interaction.reply({ embeds: [embedQuestion], components: buttons, fetchReply: true });
            } else {
                // Delay of 15s to let the user answer before sending the next question
                await wait(15000);
                message = await interaction.channel.send({ embeds: [embedQuestion], components: buttons, fetchReply: true });
            }

            // Add a createMessageComponentCollector to collect all the answers from the user
            const collector = message.createMessageComponentCollector({ componentType: ComponentType.Button, time: 10000 });

            // Start to collect the answers
            collector.on('collect', async i => {
                // Check if the user is the same as the one who did the interaction
                if (i.user.id === interaction.user.id) {
                    let txt;
                    txt = i.customId.replace('_', ' ');
                    await i.update(`You chose ` + txt);
                } else {
                    await i.reply({ content: `These buttons aren't for you!`, ephemeral: true });
                }
            });

            // Instantiate a new embed for the results
            let resultMsgEmbed = new EmbedBuilder();
            const disabledButtons = disableButtons(buttons, correctAnswer);

            // Will be executed when the collector completes
            collector.on('end', async collected => {
                console.log(`Collected ${collected.size} interactions.`);
                // If no interactions collected, send the didn't answer embed
                if (collected.size === 0) {
                    resultMsgEmbed.setColor('Red').setDescription('The good answer was: ' + correctAnswer)
                    await message.edit({ content: 'You didn\'t answer.', embeds: [embedQuestion], components: disabledButtons, fetchReply: true })
                    return await interaction.channel.send({ embeds: [resultMsgEmbed] });
                }
                // Set the embed's color based on the last user's answer provided
                if (holdingAnswer === collected.last().customId) {
                    resultMsgEmbed.setColor('Green').setDescription('Correct! It was indeed ' + correctAnswer)
                } else {
                    resultMsgEmbed.setColor('Red').setDescription('You got it wrong, it was: ' + correctAnswer)
                }

                // Edit the message to replace it with disabled buttons and send the result embed
                await message.edit({ embeds: [embedQuestion], components: disabledButtons, fetchReply: true })
                return await interaction.channel.send({ embeds: [resultMsgEmbed] });
            });
        }
    }
}