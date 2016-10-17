angular.module('app', [
    'ngRoute',
    'ngCookies',
    'angular-growl',
    'services'
]).config(function($routeProvider, $locationProvider, growlProvider) {
    growlProvider.globalTimeToLive(4000);
    $locationProvider.html5Mode(true);
    $routeProvider.when('/', {
        controller: 'CoreController as vm',
        templateUrl: '/app/core.html'
    }).when('/login', {
        controller: 'LoginController as vm',
        templateUrl: '/app/login/login.html'
    }).when('/projects', {
        controller: 'ProjectListController as vm',
        templateUrl: '/app/project/list.html'
    }).when('/projects/new', {
        controller: 'ProjectEditController as vm',
        templateUrl: '/app/project/edit.html'
    }).when('/projects/edit/:id', {
        controller: 'ProjectEditController as vm',
        templateUrl: '/app/project/edit.html'
    }).when('/projects/view/:id', {
        controller: 'ProjectViewController as vm',
        templateUrl: '/app/project/view.html'
    }).when('/settings', {
        controller: 'SettingsController as vm',
        templateUrl: '/app/settings/settings.html'
    }).when('/users', {
        controller: 'UsersListController as vm',
        templateUrl: '/app/users/list.html'
    }).otherwise({
        redirectTo: '/'
    });
}).run( function($rootScope, $location, UserService) {
    UserService.checkLoggedIn();
    $rootScope.$on('$routeChangeStart', function(event, next, current) {
        if (UserService.isLoggedIn()) {
            if (next.templateUrl === '/app/login/login.html') {
                $location.path('/');
            }
        } else {
            if (next.templateUrl !== '/app/login/login.html') {
                $location.path('/login');
            }
        }
    });
}).controller('CoreController', function() {
    var vm = this;
});

angular.module('app').filter('capitalize', function() {
    return function(input) {
      return (!!input) ? input.charAt(0).toUpperCase() + input.substr(1).toLowerCase() : '';
    }
});

angular.module('app').filter('consoleOutput', function () {
    return function (input) {
        var lines = input.split('\n'),
            output = '\n';

        for (var i=0; i<lines.length; i++) {
            output += '> ' + lines[i] + '\n';
        }

        return output;
    }
});