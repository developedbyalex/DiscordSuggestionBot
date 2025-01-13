// suggest.js
const { 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Create a new suggestion'),

    async execute(interaction, config) {
        // Create category select menu with emoji and descriptions
        const row = new ActionRowBuilder()
            .addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('category_select')
                    .setPlaceholder('Select a category')
                    .addOptions(
                        config.categories.map(cat => ({
                            label: cat.name,
                            description: cat.description,
                            emoji: cat.emoji,
                            value: cat.name
                        }))
                    )
            );

        const response = await interaction.reply({
            content: 'Please select a category:',
            components: [row],
            ephemeral: true,
            fetchReply: true
        });

        try {
            const collectorFilter = i => i.user.id === interaction.user.id;
            const selection = await response.awaitMessageComponent({ 
                filter: collectorFilter, 
                time: 30_000 
            });

            const selectedCategory = selection.values[0];
            const category = config.categories.find(cat => cat.name === selectedCategory);

            // Create and show modal
            const modal = new ModalBuilder()
                .setCustomId(`suggestion_modal_${selectedCategory}`)
                .setTitle(`New ${category.emoji} ${selectedCategory} Suggestion`);

            const titleInput = new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(100)
                .setRequired(true)
                .setPlaceholder('Enter a clear and concise title');

            const descriptionInput = new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setMaxLength(4000)
                .setRequired(true)
                .setPlaceholder(`Describe your ${selectedCategory.toLowerCase()} suggestion in detail`);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descriptionInput)
            );

            await selection.showModal(modal);

        } catch (error) {
            if (error.code === 'InteractionCollectorError') {
                await interaction.editReply({
                    content: 'Category selection timed out. Please try again.',
                    components: []
                });
            } else {
                console.error(error);
                await interaction.editReply({
                    content: 'An error occurred while processing your selection.',
                    components: []
                });
            }
        }
    }
};