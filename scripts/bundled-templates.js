const summaryTemplate = `
<details>
    <summary><strong>Title</strong></summary>
    <p>Content</p>
</details>
`;

const columnsTemplate =`<div style="column-width: 15rem; gap:1rem">
    <img src="modules/campaign-codex/ui/group.webp" style="object-fit: cover; border: none; border-radius: 5px; aspect-ratio: 1/1;">
    <p>Lorem ipsum dolor, sit amet consectetur adipisicing elit. Quaerat voluptas magni illum totam, corrupti corporis facilis adipisci cum blanditiis vitae dignissimos ab ut vel molestiae ducimus dolorem commodi, sit repudiandae!</p>
    <p>Repellendus ex consectetur nemo eum. Voluptatibus inventore veniam quibusdam eos odit nostrum ex natus repellat in blanditiis perspiciatis, quae maiores quis sit at error molestiae voluptates aut id illum officiis!</p>
    <p>Modi cupiditate quis quia magni odio similique illum! Optio ut commodi repellendus. Provident temporibus vel nobis tempore sapiente quasi molestias? Ex dolor cum iure qui adipisci praesentium tempora. Laboriosam, omnis.</p>
    <p>Ab laborum mollitia illo repellat? Placeat obcaecati cum tempora dolor esse incidunt quaerat, provident suscipit sint distinctio illum architecto? Cum nulla magni expedita tempore aperiam aut exercitationem id similique quaerat.</p>
    <p>Perspiciatis temporibus sequi, quidem odio doloribus natus repudiandae, corporis sunt labore laudantium id. Harum eum dicta tempore quisquam, atque suscipit quasi vero nisi iure consequuntur adipisci molestias libero. Aspernatur, omnis?</p>
    <p>Aut quo dolorum magnam voluptate dolores aperiam ipsa impedit, porro unde nihil! Fugiat odio obcaecati laborum unde in natus cum, velit nisi, voluptates dicta quam cupiditate placeat, perferendis exercitationem enim?</p>
    <p>Itaque iure eum rerum, beatae eos, sequi odit deleniti suscipit alias qui quos ab atque non? Cumque fugiat porro quam deserunt eligendi asperiores ipsam architecto cum, laboriosam voluptates quia dicta.</p>
    <p>Eius quibusdam modi saepe a! Necessitatibus dolorem obcaecati consectetur voluptas enim amet recusandae delectus sit dolore totam nisi, libero fuga, numquam doloribus, quaerat in. Sunt inventore suscipit vel facere totam!</p>
    <p>Est maiores illum rerum deleniti aliquid inventore nihil corporis sapiente animi, officia illo nesciunt, minima in aperiam vero quibusdam fugiat magni iusto fugit sit aliquam consequuntur. Itaque impedit fugit blanditiis!</p>
    <p>Asperiores hic ducimus vitae! Perspiciatis tenetur asperiores omnis alias nisi tempore repellat corporis recusandae sequi nostrum illo cupiditate eius minus autem soluta magni quas qui necessitatibus cum, maxime non nam.</p>
</div>
`;

const eventTemplate =`<div class="cc-enriched">

    <div style="display: flex; flex-wrap: wrap; gap: 2rem;">

        <div style="flex: 2; min-width: 300px;">
            <h1 style="font-size: 1.5em; display: block; margin-bottom: 1rem;">Lorem Ipsum</h1>
            <p>This is the main content area that appears on the left side, next to the info boxes.</p>
            <h3>Ipsum Lorem</h3>
            <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Porro, vitae, magnam nihil ipsa sit facere commodi tempore error deleniti maiores, doloremque eos debitis explicabo iusto voluptate. Consequatur quia tempora sunt!</p>
        </div>

        <div style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1rem;">
            <div style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><strong>When</strong> <span>12/12/2021</span></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><strong>Where</strong> <span>Lorem</span></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><strong>Who</strong> <span>Lorem</span></div>
                <hr>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><strong>When</strong> <span>12/12/2021</span></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><strong>Where</strong> <span>Lorem</span></div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;"><strong>Who</strong> <span>Lorem</span></div>
            </div>
            <div class=style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b;">
                <h3>Lorem</h3>
                <p>Lorem ipsum dolor sit, amet consectetur adipisicing elit. Earum similique tempore, cumque consectetur veniam distinctio nobis labore cupiditate!</p>
                <hr>
                <h3>Ipsum</h3>
                <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Quibusdam autem nulla exercitationem dolores nostrum rerum, magnam maiores alias minus accusamus.</p>
            </div>
        </div>

    </div> <div style="margin-top: 2rem;">
        <hr>
        <h3>This is the Full-Width Section</h3>
        <p>This content is placed outside the "cc-grid-layout" div, so it will appear below the columns and span the full width of the container.</p>
        <p>Lorem ipsum dolor sit amet consectetur adipisicing elit. Eius quibusdam modi saepe a! Necessitatibus dolorem obcaecati consectetur voluptas enim amet recusandae delectus sit dolore totam nisi, libero fuga, numquam doloribus, quaerat in. Sunt inventore suscipit vel facere totam!</p>
        <p>Est maiores illum rerum deleniti aliquid inventore nihil corporis sapiente animi, officia illo nesciunt, minima in aperiam vero quibusdam fugiat magni iusto fugit sit aliquam consequuntur. Itaque impedit fugit blanditiis!</p>
    </div>
    </div>
`;
const locationTemplate = `<div>
    <div>
        <h1>Location Name</h1>
        <p><i>A brief, italicized summary of the location.</i></p>
        <hr style="border: 0; border-top: 1px solid #0000001a;">
        
        <p>A detailed description of the location, including its atmosphere, key features, and general information. This is where you can paint a picture for the reader.</p>

        <h3>Points of Interest</h3>
        <p><strong>Interesting Place 1:</strong> A short description of the first point of interest. What makes it significant?</p>
        <p><strong>Interesting Place 2:</strong> A short description of the second point of interest. What can be found or done here?</p>
        <p><strong>Interesting Place 3:</strong> A short description of the third point of interest. Who or what might one encounter here?</p>
    </div>

    <div style="margin-top: 2rem;">
        <figure style="margin: 0 0 1rem 0;">
            <img src="modules/campaign-codex/ui/group.webp" alt="Location Image" style="display: block; width: 100%; object-fit: cover; border-radius: 3px;">
        </figure>
        <div style="background: #0000000d; padding: 1rem; border-radius: 5px; border: 1px solid #0000001a;">
            <h3 style="margin-top: 0; border-bottom: 1px solid #0000001a; padding-bottom: 0.5rem;">Key Facts</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Fact A</strong>
                <span>Detail A</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Fact B</strong>
                <span>Detail B</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Fact C</strong>
                <span>Detail C</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0;">
                <strong>Fact D</strong>
                <span>Detail D</span>
            </div>
        </div>
    </div>
</div>`;

const locationColumnsTemplate = `<div style="display: flex; flex-wrap: wrap; gap: 2rem;">

    <!-- Main Content: Description, Points of Interest -->
    <div style="flex: 2; min-width: 300px;">
        <h1 style="font-size: 1.5em; display: block; margin-bottom: 1rem; ">Silvermist Port</h1>
        <p style="font-style: italic;">A bustling port city known for its hardy sailors and the thick, silver mist that rolls in from the sea each morning.</p>
        <hr style="border-color: #0000003b;">
        
        <p>Carved into the cliffs of the Azure Coast, Silvermist is a city of second chances. Its winding streets are slick with sea spray, and the air is thick with the scent of salt, tar, and exotic spices. By day, the markets teem with merchants from distant lands. By night, the taverns are filled with the boisterous songs of sailors and the hushed whispers of smugglers. The city is ruled by a council of powerful merchant captains, whose wealth is matched only by their ambition.</p>

        <h3 style="margin-top: 1rem; border-bottom: 1px solid #0000003b; padding-bottom: 0.5rem;">Points of Interest</h3>
        <p><strong>The Salty Siren:</strong> A rowdy tavern famed for its potent grog and the questionable reliability of its patrons. A great place to gather rumors.</p>
        <p><strong>The Harbormaster's Office:</strong> A tall, imposing stone building overlooking the docks. The Harbormaster, a stern man named Kaelen, sees everything that comes and goes from the port.</p>
        <p><strong>The Jade Market:</strong> An open-air bazaar where one can find anything from rare silks to forbidden magical components, provided you know who to ask.</p>
    </div>

    <!-- Sidebar: Key Facts -->
    <div style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1rem;">
        <figure style="margin: 0;">
            <img src="modules/campaign-codex/ui/group.webp" alt="City Crest" style="display: block; width: 100%; object-fit: cover; border-radius: 3px;">
        </figure>
        <div style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b;">
            <h3 style="margin-top: 0; border-bottom: 1px solid #0000003b; padding-bottom: 0.5rem;">Key Facts</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Population</strong>
                <span>~15,000</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Government</strong>
                <span>Merchant Council</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Major Factions</strong>
                <span>The Dockworkers' Guild, The Veiled Syndicate</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0;">
                <strong>Main Exports</strong>
                <span>Fish, Timber, Rare Ores</span>
            </div>
        </div>
    </div>
</div>
`;


const npcTemplate = `
<div style="display: flex; flex-wrap: wrap; gap: 2rem;">

    <div style="flex: 2; min-width: 300px;">
        <h1>NPC Name</h1>
        <p><i>A brief, italicized summary or quote about the character.</i></p>
        <hr style="border: 0; border-top: 1px solid #0000001a;">
        
        <h2>Appearance</h2>
        <p>A description of the character's physical appearance, clothing, and distinguishing features goes here. Keep it concise but evocative.</p>

        <h2>Roleplaying</h2>
        <p>Notes on the character's personality, mannerisms, voice, and typical behavior. This section helps in portraying the character consistently.</p>
        
        <h2>Background</h2>
        <p>The character's history, motivations, and significant life events. This can include their origins, key relationships, and what drives them.</p>
        
        <h3 style="color: #B71C1C;">Key Info / Quest Hook</h3>
        <p>A crucial piece of information, a secret, or a plot hook related to this NPC.</p>
    </div>

    <div style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1rem;">
        <figure style="margin: 0;">
            <img src="modules/campaign-codex/ui/group.webp" alt="Character Portrait" style="display: block; width: 100%; object-fit: cover; border-radius: 3px;">
        </figure>

        <div style="background: #0000000d; padding: 1rem; border-radius: 5px; border: 1px solid #0000001a;">
            <h3 style="margin-top: 0; border-bottom: 1px solid #0000001a; padding-bottom: 0.5rem;">Bio</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Trait 1</strong>
                <span>Value 1</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Trait 2</strong>
                <span>Value 2</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0;">
                <strong>Trait 3</strong>
                <span>Value 3</span>
            </div>
        </div>
        
        <div style="background: #0000000d; padding: 1rem; border-radius: 5px; border: 1px solid #0000001a;">
            <h3 style="margin-top: 0; border-bottom: 1px solid #0000001a; padding-bottom: 0.5rem;">Social</h3>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Attitude</strong>
                <span style="color: #2E7D32;">Friendly</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Faction</strong>
                <span style="color: #B71C1C;">Faction Name</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0;">
                <strong>Vocation</strong>
                <span>Occupation</span>
            </div>
        </div>
    </div>
</div>
`;

const statBlockTemplate = `
<div style="display: flex; flex-wrap: wrap; gap: 2rem;">

    <!-- Main Content: Actions, Descriptions -->
    <div style="flex: 2; min-width: 300px;">
        <h1 style="font-size: 1.5em; display: block; margin-bottom: 1rem;  ">Gravemaw Hydra</h1>
        <p style="font-style: italic;">Huge monstrosity, chaotic evil</p>
        <hr style="border-color: #0000003b">

        <p>Emerging from the stinking swamps of the Gloomfen, the Gravemaw Hydra is a terrifying predator. Each of its heads can spit a corrosive acid, and for every head severed, two more sprout forth in a writhing, furious display. Its scales are thick as iron plates, stained with the mud and decay of its foul lair.</p>

        <h3 style="margin-top: 1rem; border-bottom: 1px solid #0000003b; padding-bottom: 0.5rem; ">Actions</h3>
        <p><strong>Multiattack.</strong> The hydra makes as many bite attacks as it has heads.</p>
        <p><strong>Bite.</strong> <em>Melee Weapon Attack:</em> +8 to hit, reach 10 ft., one target. <em>Hit:</em> 10 (1d10 + 5) piercing damage.</p>
        <p><strong>Acid Spit (Recharge 5-6).</strong> The hydra spews acid in a 30-foot cone. Each creature in that area must make a DC 15 Dexterity saving throw, taking 45 (10d8) acid damage on a failed save, or half as much damage on a successful one.</p>
        
        <h3 style="margin-top: 1rem; border-bottom: 1px solid #0000003b; padding-bottom: 0.5rem; ">Legendary Actions</h3>
        <p>The hydra can take 3 legendary actions. Only one legendary action option can be used at a time and only at the end of another creature's turn. The hydra regains spent legendary actions at the start of its turn.</p>
        <p><strong>Detect.</strong> The hydra makes a Wisdom (Perception) check.</p>
        <p><strong>Tail Swipe.</strong> The hydra sweeps its tail. Each creature in a 15-foot cone originating from the hydra must succeed on a DC 15 Dexterity saving throw or be knocked prone.</p>
    </div>

    <!-- Sidebar: Core Stats -->
    <div style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1rem;">
        <div style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Armor Class</strong>
                <span>15 (Natural Armor)</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Hit Points</strong>
                <span>172 (15d12 + 75)</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Speed</strong>
                <span>30 ft., swim 30 ft.</span>
            </div>
        </div>
        <div style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b; text-align: center;">
            <div style="display: flex; justify-content: space-around;">
                <div><strong>STR</strong><br>20 (+5)</div>
                <div><strong>DEX</strong><br>12 (+1)</div>
                <div><strong>CON</strong><br>20 (+5)</div>
                <div><strong>INT</strong><br>2 (-4)</div>
                <div><strong>WIS</strong><br>10 (+0)</div>
                <div><strong>CHA</strong><br>7 (-2)</div>
            </div>
        </div>
        <div style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b;">
             <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Skills</strong>
                <span>Perception +6</span>
            </div>
             <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                <strong>Senses</strong>
                <span>Darkvision 60 ft.</span>
            </div>
             <div style="display: flex; justify-content: space-between; margin-bottom: 0;">
                <strong>Challenge</strong>
                <span>8 (3,900 XP)</span>
            </div>
        </div>
    </div>
</div>
`;

const wikiTemplate = `<div style="display: flex; flex-wrap: wrap; gap: 2rem;">

        <div style="flex: 2; min-width: 300px;">
            <h1 style="font-size: 1.5em; display: block; margin-bottom: 1rem;">Lorem Ipsum</h1>
            <p>Lorem ipsum dolor sit amet consectetur, adipisicing elit. Adipisci obcaecati, nihil alias ab commodi quasi aliquid. Assumenda maiores, esse laudantium, atque amet alias eum qui, optio voluptate dolores sequi mollitia!</p>
            <h3 style="margin-top: 0; border-bottom: 1px solid #0000003b; padding-bottom: 0.5rem;">Ipsum Lorem</h3>
            <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Porro, vitae, magnam nihil ipsa sit facere commodi tempore error deleniti maiores, doloremque eos debitis explicabo iusto voluptate. Consequatur quia tempora sunt!</p>
            <h3 style="margin-top: 0; border-bottom: 1px solid #0000003b; padding-bottom: 0.5rem;">Ipsum Lorem</h3>
            <p>Lorem ipsum dolor sit amet, consectetur adipisicing elit. Porro, vitae, magnam nihil ipsa sit facere commodi tempore error deleniti maiores, doloremque eos debitis explicabo iusto voluptate. Consequatur quia tempora sunt!</p>
        </div>

        <div style="flex: 1; min-width: 250px; display: flex; flex-direction: column; gap: 1rem;">
            <figure style="display: block; width: 100%; aspect-ratio: 1 / 1.5; object-fit: cover; border-radius: 3px;">
                <img src="modules/campaign-codex/ui/group.webp" alt="" style="display: block; width: 100%; aspect-ratio: 1 / 1.5; object-fit: cover; border-radius: 3px;">
            </figure>
            <div style="background: #0000001a; padding: 1rem; border-radius: 5px; border: 1px solid #0000003b;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <strong>Name</strong>
                    <span>Lorem</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
                    <strong>Age</strong>
                    <span>1345</span>
                </div>
                <div style="display: flex; justify-content: space-between; border-bottom: none; margin-bottom: 0;">
                    <strong>Race</strong>
                    <span>Lorem</span>
                </div>
            </div>
        </div>

    </div>`;


export const BUNDLED_TEMPLATES = [
    {
        title: "Summary", 
        content: summaryTemplate,
        filePath: null 
    },
    {
        title: "Columns",
        content: columnsTemplate,
        filePath: null
    },
    {
        title: "Event",
        content: eventTemplate,
        filePath: null
    },
    {
        title: "Location 1 Column",
        content: locationTemplate,
        filePath: null
    },
    {
        title: "Location",
        content: locationColumnsTemplate,
        filePath: null
    },
    {
        title: "NPC",
        content: npcTemplate,
        filePath: null
    },
    {
        title: "Stat Block",
        content: statBlockTemplate,
        filePath: null
    },
    {
        title: "Wiki",
        content: wikiTemplate,
        filePath: null
    }
];