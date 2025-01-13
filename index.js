// index.js
const { Client, GatewayIntentBits, Collection, REST, Routes, EmbedBuilder, ChannelType: { GuildText }, MessageFlags } = require('discord.js');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// Load config
const config = yaml.load(fs.readFileSync('./config.yml', 'utf8'));

// Create client
const client = new Client({
   intents: [
       GatewayIntentBits.Guilds,
       GatewayIntentBits.GuildMessages,
       GatewayIntentBits.GuildMessageReactions
   ],
   partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

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

       const message = await channel.send({ embeds: [embed] });
       await message.react(config.upvoteEmoji);
       await message.react(config.downvoteEmoji);

       await interaction.reply({ 
           content: `Suggestion submitted in ${channel}!`, 
           flags: MessageFlags.Ephemeral
       });
   }
});

// Handle reaction changes
client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    // Ignore bot reactions
    if (user.bot) return;

    // Check if it's in any of the category channels
    if (!config.categories.some(cat => cat.channelId === reaction.message.channel.id)) return;

    // Check if it's one of our voting emojis
    if (![config.upvoteEmoji, config.downvoteEmoji].includes(reaction.emoji.name)) return;

    // Remove the opposite reaction if it exists
    const oppositeEmoji = reaction.emoji.name === config.upvoteEmoji ? config.downvoteEmoji : config.upvoteEmoji;
    const oppositeReaction = reaction.message.reactions.cache.get(oppositeEmoji);
    if (oppositeReaction) {
        try {
            await oppositeReaction.users.remove(user.id);
        } catch (error) {
            console.error('Error removing opposite reaction:', error);
        }
    }

    // Get the message embed
    const embed = reaction.message.embeds[0];
    if (!embed) return;

    // Get reactions and fetch users for accurate counts
    const upvoteReaction = reaction.message.reactions.cache.get(config.upvoteEmoji);
    const downvoteReaction = reaction.message.reactions.cache.get(config.downvoteEmoji);

    // Fetch users who reacted (excluding bots)
    const upvoteUsers = (await upvoteReaction?.users.fetch())?.filter(u => !u.bot) || new Collection();
    const downvoteUsers = (await downvoteReaction?.users.fetch())?.filter(u => !u.bot) || new Collection();

    // Update the votes field
    const updatedEmbed = EmbedBuilder.from(embed)
        .spliceFields(-1, 1, { 
            name: 'Votes', 
            value: `${config.upvoteEmoji} ${upvoteUsers.size} | ${config.downvoteEmoji} ${downvoteUsers.size}`, 
            inline: true 
        });

    await reaction.message.edit({ embeds: [updatedEmbed] });
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Something went wrong when fetching the message:', error);
            return;
        }
    }

    // Ignore bot reactions
    if (user.bot) return;

    // Check if it's in any of the category channels
    if (!config.categories.some(cat => cat.channelId === reaction.message.channel.id)) return;

    // Check if it's one of our voting emojis
    if (![config.upvoteEmoji, config.downvoteEmoji].includes(reaction.emoji.name)) return;

    // Get the message embed
    const embed = reaction.message.embeds[0];
    if (!embed) return;

    // Get reactions and fetch users for accurate counts
    const upvoteReaction = reaction.message.reactions.cache.get(config.upvoteEmoji);
    const downvoteReaction = reaction.message.reactions.cache.get(config.downvoteEmoji);

    // Fetch users who reacted (excluding bots)
    const upvotes = upvoteReaction ? (await upvoteReaction.users.fetch()).filter(u => !u.bot).size : 0;
    const downvotes = downvoteReaction ? (await downvoteReaction.users.fetch()).filter(u => !u.bot).size : 0;

    // Update the votes field
    const updatedEmbed = EmbedBuilder.from(embed)
        .spliceFields(-1, 1, { 
            name: 'Votes', 
            value: `${config.upvoteEmoji} ${upvotes} | ${config.downvoteEmoji} ${downvotes}`, 
            inline: true 
        });

    await reaction.message.edit({ embeds: [updatedEmbed] });
});

client.once('ready', async () => {
   await deployCommands();
   console.log('Bot is ready!');
});

client.login(config.token);