// accept.js
const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('accept')
        .setDescription('Accept a suggestion')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('The ID of the suggestion message')
                .setRequired(true)
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, config) {
        const messageId = interaction.options.getString('message_id');

        try {
            // Check all category channels
            let targetMessage = null;
            let targetChannel = null;

            for (const category of config.categories) {
                const channel = interaction.guild.channels.cache.get(category.channelId);
                if (channel) {
                    try {
                        targetMessage = await channel.messages.fetch(messageId);
                        if (targetMessage) {
                            targetChannel = channel;
                            break;
                        }
                    } catch (err) {
                        // Message not found in this channel, continue searching
                        continue;
                    }
                }
            }

            if (!targetMessage) {
                return await interaction.reply({ 
                    content: 'Could not find that suggestion in any category channel.', 
                    ephemeral: true 
                });
            }

            const embed = EmbedBuilder.from(targetMessage.embeds[0])
                .setColor(config.acceptedColor)
                .addFields({ name: 'Status', value: '✅ Accepted', inline: false });

            await targetMessage.edit({ embeds: [embed] });
            await interaction.reply({ 
                content: `Suggestion accepted in ${targetChannel}!`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ 
                content: 'An error occurred while processing the command.', 
                ephemeral: true 
            });
        }
    }
};