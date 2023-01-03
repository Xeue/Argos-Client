module.exports = {
	entry: {
		main: './src/main/main.js'
	},
	main: {
		'extraEntries': ['@/preload.js']
	},
	optimization: {
		concatenateModules: true
	}
};