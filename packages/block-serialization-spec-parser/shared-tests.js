export const testParser = ( parse ) => () => {
	describe( 'basic parsing', () => {
		test( 'parse() works properly', () => {
			expect( parse( '<!-- wp:core/more --><!--more--><!-- /wp:core/more -->' ) ).toMatchSnapshot();
		} );
	} );

	describe( 'generic tests', () => {
		test( 'parse() accepts inputs with multiple Reusable blocks', () => {
			expect( parse( '<!-- wp:block {"ref":313} /--><!-- wp:block {"ref":482} /-->' ) ).toEqual( [
				expect.objectContaining( {
					blockName: 'core/block',
					attrs: { ref: 313 },
				} ),
				expect.objectContaining( {
					blockName: 'core/block',
					attrs: { ref: 482 },
				} ),
			] );
		} );

		test( 'treats void blocks and empty blocks identically', () => {
			expect( parse(
				'<!-- wp:block /-->'
			) ).toEqual( parse(
				'<!-- wp:block --><!-- /wp:block -->'
			) );

			expect( parse(
				'<!-- wp:my/bus { "is": "fast" } /-->'
			) ).toEqual( parse(
				'<!-- wp:my/bus { "is": "fast" } --><!-- /wp:my/bus -->'
			) );
		} );

		test( 'should grab HTML soup before block openers', () => {
			[
				'<p>Break me</p><!-- wp:block /-->',
				'<p>Break me</p><!-- wp:block --><!-- /wp:block -->',
			].forEach( ( input ) => expect( parse( input ) ).toEqual( [
				expect.objectContaining( { innerHTML: '<p>Break me</p>' } ),
				expect.objectContaining( { blockName: 'core/block', innerHTML: '' } ),
			] ) );
		} );

		test( 'should grab HTML soup before inner block openers', () => [
			'<!-- wp:outer --><p>Break me</p><!-- wp:block /--><!-- /wp:outer -->',
			'<!-- wp:outer --><p>Break me</p><!-- wp:block --><!-- /wp:block --><!-- /wp:outer -->',
		].forEach( ( input ) => expect( parse( input ) ).toEqual( [
			expect.objectContaining( {
				innerBlocks: [ expect.objectContaining( { blockName: 'core/block', innerHTML: '' } ) ],
				innerHTML: '<p>Break me</p>',
			} ),
		] ) ) );

		test( 'should grab HTML soup after blocks', () => [
			'<!-- wp:block /--><p>Break me</p>',
			'<!-- wp:block --><!-- /wp:block --><p>Break me</p>',
		].forEach( ( input ) => expect( parse( input ) ).toEqual( [
			expect.objectContaining( { blockName: 'core/block', innerHTML: '' } ),
			expect.objectContaining( { innerHTML: '<p>Break me</p>' } ),
		] ) ) );

		test( 'non-blocks get no block markers', () => (
			expect( parse( 'HTML soup' )[ 0 ] ).not.toHaveProperty( 'blockMarkers' )
		) );
	} );

	describe( 'blockMarkers', () => {
		test( 'adds empty block markers when no inner blocks exist', () => [
			'<!-- wp:void /-->',
			'<!-- wp:block --><!-- /wp:block -->',
			'<!-- wp:block -->with content<!-- /wp:block -->',
		].forEach( ( document ) => expect( parse( document )[ 0 ] ).toHaveProperty( 'blockMarkers', [] ) ) );

		test( 'adds block markers for inner blocks', () => [
			[ '<!-- wp:block --><!-- wp:void /--><!-- /wp:block -->', [ 0 ] ],
			[ '<!-- wp:block -->aa<!-- wp:void /-->bb<!-- /wp:block -->', [ 2 ] ],
			[ '<!-- wp:block -->aa<!-- wp:inner -->bb<!-- /wp:inner -->cc<!-- /wp:block -->', [ 2 ] ],
			[ '<!-- wp:block --><!-- wp:start /-->aa<!-- wp:inner -->bb<!-- /wp:inner -->cc<!-- wp:end /--><!-- /wp:block -->', [ 0, 2, 4 ] ],
		].forEach( ( [ document, markers ] ) => expect( parse( document )[ 0 ] ).toHaveProperty( 'blockMarkers', markers ) ) );

		test( 'block markers report UTF-8 encoding byte-length', () => {
			const run = ( c ) => parse( `<!-- wp:block -->${ c }<!-- wp:void /--><!-- /wp:block -->` )[ 0 ];

			// normal conditions
			expect( run( '\u{0024}' ) ).toHaveProperty( 'blockMarkers', [ 1 ] ); // $ U+0000 - U+007F
			expect( run( '\u{00a2}' ) ).toHaveProperty( 'blockMarkers', [ 2 ] ); // ¢ U+0080 - U+07FF
			expect( run( '\u{20ac}' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // € U+0800 - U+7FFF
			expect( run( '\u{f8ff}' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); //  U+8000 - U+FFFF
			expect( run( '\u{10348}' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 𐍈 U+10000 - U+1FFFF

			expect( run( '$' ) ).toHaveProperty( 'blockMarkers', [ 1 ] ); // $ U+0000 - U+007F
			expect( run( '¢' ) ).toHaveProperty( 'blockMarkers', [ 2 ] ); // ¢ U+0080 - U+07FF
			expect( run( '€' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // € U+0800 - U+7FFF
			expect( run( '' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); //  U+8000 - U+FFFF
			expect( run( '𐍈' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 𐍈 U+10000 - U+1FFFF

			// surrogate pairs
			expect( run( '\u{d800}' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // invalid unpaired surrogate
			expect( run( '\u{dc00}' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // invalid unpaired surrogate
			expect( run( '\u{10000}' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 𐀀 surrogate pair U+D800 U+DC00
			expect( run( '\ud800\udc00' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 𐀀 surrogate pair U+D800 U+DC00
			expect( run( '𐀀' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 𐀀 surrogate pair U+D800 U+DC00

			// variations
			expect( run( '\u{845b}' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // edible bean; surname
			expect( run( '\u{845b}\u{e0100}' ) ).toHaveProperty( 'blockMarkers', [ 7 ] ); // edible bean; surname + variation

			// NOTE: The next two run() strings _are not the same_ - check the encoding/raw bytes
			// The first is the character by itself
			// The second is the character plus the variation
			expect( run( '葛' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // edible bean; surname
			expect( run( '葛󠄀' ) ).toHaveProperty( 'blockMarkers', [ 7 ] ); // edible bean; surname + variation

			// higher planes
			expect( run( '\u{24b62}' ) ).toHaveProperty( 'blockMarkers', [ 4 ] );
			expect( run( '𤭢' ) ).toHaveProperty( 'blockMarkers', [ 4 ] );

			// invalids
			expect( run( '\u{fffd}' ) ).toHaveProperty( 'blockMarkers', [ 3 ] ); // replacement character
			expect( run( '\u{80}' ) ).toHaveProperty( 'blockMarkers', [ 2 ] ); // unexpected continuation byte
			expect( run( '\u{fe}' ) ).toHaveProperty( 'blockMarkers', [ 2 ] ); // invalid byte

			// emoji
			expect( run( '\u{1f4a9}' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 💩 pile of poo
			expect( run( '💩' ) ).toHaveProperty( 'blockMarkers', [ 4 ] ); // 💩 pile of poo
			expect( run( '\u{2764}\u{fe0f}' ) ).toHaveProperty( 'blockMarkers', [ 6 ] ); // ❤️ black heart + variation 16
			expect( run( '❤️' ) ).toHaveProperty( 'blockMarkers', [ 6 ] ); // ❤️ black heart + variation 16
		} );
	} );
};
