angular.module('core', ['ngRoute'])
.config(function($routeProvider, $locationProvider) {
    $locationProvider.html5Mode(true);
    $routeProvider
        .when('/', {
            controller: 'CoreController as vm',
            templateUrl: 'app/core.html'
        })
        .when('/edit/:projectId', {
            controller: 'EditProjectController as vm',
            templateUrl: 'detail.html'
        })
        .when('/new', {
            controller: 'NewProjectController as vm',
            templateUrl: 'detail.html'
        })
        .otherwise({
            redirectTo:'/'
        });
})
.controller('CoreController', function($location, $routeParams) {
    //var socket = io();
});