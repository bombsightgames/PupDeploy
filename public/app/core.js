angular.module('core', [
    'ngRoute',
    'ngCookies',
    'angular-growl',
    'services',
    'app'
]).config(function($routeProvider, $locationProvider, growlProvider) {
    growlProvider.globalTimeToLive(4000);
    $locationProvider.html5Mode(true);
    $routeProvider.when('/', {
        controller: 'CoreController as vm',
        templateUrl: '/app/core.html'
    }).when('/edit/:projectId', {
        controller: 'EditProjectController as vm',
        templateUrl: 'detail.html'
    }).when('/new', {
        controller: 'NewProjectController as vm',
        templateUrl: 'detail.html'
    }).otherwise({
        redirectTo: '/'
    });
})
.controller('CoreController', function($rootScope, $scope, growl, UserService) {
    var vm = this;

    vm.showLogin = UserService.checkLoggedIn();
    $rootScope.$on('login', function() {
        vm.showLogin = false;
        $scope.$apply();
    });
});