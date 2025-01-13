// index.js
const { 
    Client, 
    GatewayIntentBits, 
    Collection, 
    REST, 
    Routes, 
    EmbedBuilder, 
    ChannelType: { GuildText }, 
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// Load config
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

function createSuggestionComponents() {
    const upvoteButton = new ButtonBuilder()
        .setCustomId('upvote')
        .setEmoji(config.upvoteEmoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(false);

    const downvoteButton = new ButtonBuilder()
        .setCustomId('downvote')
        .setEmoji(config.downvoteEmoji)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(false);

    return new ActionRowBuilder().addComponents(upvoteButton, downvoteButton);
}

// Commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commands = [];
for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// Deploy commands function
async function deployCommands() {
    try {
        console.log('Started refreshing application (/) commands.');

        const rest = new REST().setToken(config.token);
        await rest.put(
            Routes.applicationGuildCommands(config.clientId, config.guildId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
}

// Handle interactions
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction, config);
        } catch (error) {
            console.error(error);
            await interaction.reply({
                content: 'There was an error executing this command!',
                flags: MessageFlags.Ephemeral
            });
        }
    } else if (interaction.isModalSubmit()) {
        if (!interaction.customId.startsWith('suggestion_modal_')) return;

        const category = interaction.customId.replace('suggestion_modal_', '');
        const categoryConfig = config.categories.find(cat => cat.name === category);

        const channel = interaction.guild.channels.cache.get(categoryConfig.channelId);
        if (!channel) {
            return await interaction.reply({
                content: `Channel for category ${category} not found!`,
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.defaultColor)
            .setTitle(`${categoryConfig.emoji} ${interaction.fields.getTextInputValue('title')}`)
            .setDescription(interaction.fields.getTextInputValue('description'))
            .addFields(
                { name: 'Category', value: `${categoryConfig.emoji} ${category}`, inline: true },
                { name: 'Suggested by', value: interaction.user.toString(), inline: true },
                { name: 'Votes', value: `${config.upvoteEmoji} 0 | ${config.downvoteEmoji} 0`, inline: true }
            )
            .setTimestamp();

        const message = await channel.send({ 
            embeds: [embed],
            components: [createSuggestionComponents()]
        });

        await interaction.reply({ 
            content: `Suggestion submitted in ${channel}!`, 
            flags: MessageFlags.Ephemeral 
        });
    } else if (interaction.isButton()) {
        // Check if it's in any of the category channels
        if (!config.categories.some(cat => cat.channelId === interaction.channel.id)) return;

        const message = interaction.message;
        const embed = message.embeds[0];
        
        if (!embed) return;

        // Get current votes from the embed field
        const votesField = embed.fields.find(field => field.name === 'Votes');
        if (!votesField) return;

        const [upvotes, downvotes] = votesField.value.split('|').map(part => 
            parseInt(part.trim().split(' ')[1])
        );

        let newUpvotes = upvotes;
        let newDownvotes = downvotes;

        // Get current button states
        const currentRow = ActionRowBuilder.from(message.components[0]);
        const buttons = currentRow.components;
        
        // Create new buttons based on interaction
        const upvoteButton = ButtonBuilder.from(buttons[0]);
        const downvoteButton = ButtonBuilder.from(buttons[1]);

        // Check which button was clicked
        if (interaction.customId === 'upvote') {
            if (upvoteButton.data.disabled) {
                // Remove upvote
                newUpvotes--;
                upvoteButton.setDisabled(false);
                downvoteButton.setDisabled(false);
            } else {
                // Add upvote and remove downvote if exists
                newUpvotes++;
                if (downvoteButton.data.disabled) {
                    newDownvotes--;
                }
                upvoteButton.setDisabled(true);
                downvoteButton.setDisabled(false);
            }
        } else if (interaction.customId === 'downvote') {
            if (downvoteButton.data.disabled) {
                // Remove downvote
                newDownvotes--;
                upvoteButton.setDisabled(false);
                downvoteButton.setDisabled(false);
            } else {
                // Add downvote and remove upvote if exists
                newDownvotes++;
                if (upvoteButton.data.disabled) {
                    newUpvotes--;
                }
                upvoteButton.setDisabled(false);
                downvoteButton.setDisabled(true);
            }
        }

        // Update the embed
        const updatedEmbed = EmbedBuilder.from(embed)
            .spliceFields(-1, 1, {
                name: 'Votes',
                value: `${config.upvoteEmoji} ${newUpvotes} | ${config.downvoteEmoji} ${newDownvotes}`,
                inline: true
            });

        // Create new action row with updated buttons
        const newRow = new ActionRowBuilder()
            .addComponents(upvoteButton, downvoteButton);

        await interaction.update({
            embeds: [updatedEmbed],
            components: [newRow]
        });
    }
});

client.once('ready', async () => {
    await deployCommands();
    console.log('Bot is ready!');
});

client.login(config.token);